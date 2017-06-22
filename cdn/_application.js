"use strict";

var DEBUG_MODE = true;
var COLOR_DEBUG = "blue";
var COLOR_EXCEPTION = "red";

// Events.js
class EventEmitter {

    constructor() {
        debugLog('Object Events created');
        
        this.lastToken = 0;
        //this.subscribers = null;
        this.subscribers = {};
    }

    destroy() {
        this.subscribers = null;
    }

    emit(event) {
        var emitArgs = [].slice.call(arguments, 1);
        for (var k in this.subscribers) {
            var scb = this.subscribers[k];
            if (scb.event === event) {
                scb.subscriber.apply(scb.ctx, emitArgs);
            }
        }
    }

    on(event, subscriber, ctx) {
        var token = ++this.lastToken;
        this.subscribers[token] = {
            event: event,
            subscriber: subscriber,
            ctx: ctx
        };
        return token;
    }

    off(token) {
        delete this.subscribers[token];
    }
}

var Events = {

    Emitter: EventEmitter,

    listen: function() {
        this._listen('addEventListener', arguments);
    },

    unlisten: function() {
        this._unlisten('removeEventListener', arguments);
    },

    on: function() {
        this._listen('on', arguments);
    },

    off: function() {
        this._unlisten('off', arguments);
    },

    _listen: function(method, argsObject) {
        var args = [].slice.apply(argsObject);
        var object = args[0];
        var handlers = args[1];
        var context = args[2];
        var bindArgs = args.slice(2);
        for (var k in handlers) {
            var bound = context[k + '_bound'] = handlers[k].bind.apply(handlers[k], bindArgs);
            object[method](k, bound);
        }
    },

    _unlisten: function(method, args) {
        //debugLog("method");
        //console.log(method);
        //debugLog("args");
        //console.log(args);
        var object = args[0];
        var handlers = args[1];
        var context = args[2];
        for (var k in handlers) {
            object[method](k, context[k + '_bound']);
        }
    }
};

// PeerConnection.js
class PeerConnection extends Events.Emitter {
    constructor(socket, peerUser, isInitiator) {
        super(); // this.parent();

        this.CHANNEL_NAME = 'data';

        this.iceServers = [{
            url: 'stun:stun.l.google.com:19302'
        }, {
            url: 'stun:stun.anyfirewall.com:3478'
        }, {
            url: 'turn:turn.bistri.com:80',
            credential: 'homeo',
            username: 'homeo'
        }, {
            url: 'turn:turn.anyfirewall.com:443?transport=tcp',
            credential: 'webrtc',
            username: 'webrtc'
        }];

        this.socket = null;
        this.isInitiator = false;
        this.dataChannelReady = false;
        this.peerConnection = null;
        this.dataChannel = null;
        this.remoteDescriptionReady = false;
        this.pendingCandidates = null;
        this.lastMessageOrd = null;

        // Сам конструктор
        //window.peer = this;
        debugLog('Object PeerConnection created');

        this.socket = socket;
        this.peerUser = peerUser;
        this.isInitiator = isInitiator;
        this.pendingCandidates = [];
        this.peerHandlers = {
            'icecandidate': this.onLocalIceCandidate,
            'iceconnectionstatechange': this.onIceConnectionStateChanged,
            'datachannel': this.onDataChannel
        };
        this.dataChannelHandlers = {
            'open': this.onDataChannelOpen,
            'close': this.onDataChannelClose,
            'message': this.onDataChannelMessage
        };
        this.connect();
    }

    destroy() {
        // TODO: вызвать метод родителя
        //this.parent();
        this.subscribers = null;

        this.closePeerConnection();
    }

    connect() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        });
        Events.listen(this.peerConnection, this.peerHandlers, this);
        if (this.isInitiator) {
            this.openDataChannel(
                this.peerConnection.createDataChannel(this.CHANNEL_NAME, {
                    ordered: false
                }));
        }
        if (this.isInitiator) {
            this.setLocalDescriptionAndSend();
        }
    }

    closePeerConnection() {
        this.closeDataChannel();
        Events.unlisten(this.peerConnection, this.peerHandlers, this);
        if (this.peerConnection.signalingState !== 'closed') {
            this.peerConnection.close();
        }
    }

    setSdp(sdp) {
        var self = this;
        // Create session description from sdp data
        var rsd = new RTCSessionDescription(sdp);
        // And set it as remote description for peer connection
        self.peerConnection.setRemoteDescription(rsd)
            .then(function() {
                self.remoteDescriptionReady = true;
                self.log('Got SDP from remote peer', 'green');
                // Add all received remote candidates
                while (self.pendingCandidates.length) {
                    self.addRemoteCandidate(self.pendingCandidates.pop());
                }
                // Got offer? send answer
                if (!self.isInitiator) {
                    self.setLocalDescriptionAndSend();
                }
            });
    }

    setLocalDescriptionAndSend() {
        var self = this;
        self.getDescription()
            .then(function(localDescription) {
                self.peerConnection.setLocalDescription(localDescription)
                    .then(function() {
                        self.log('Sending SDP', 'green');
                        self.sendSdp(self.peerUser.userId, localDescription);
                    });
            })
            .catch(function(error) {
                self.log('onSdpError: ' + error.message, 'red');
            });
    }

    getDescription() {
        return this.isInitiator ?
            this.peerConnection.createOffer() :
            this.peerConnection.createAnswer();
    }

    addIceCandidate(candidate) {
        if (this.remoteDescriptionReady) {
            this.addRemoteCandidate(candidate);
        } else {
            this.pendingCandidates.push(candidate);
        }
    }

    addRemoteCandidate(candidate) {
        try {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            this.log('Added his ICE-candidate:' + candidate.candidate, 'gray');
        } catch (err) {
            this.log('Error adding remote ice candidate' + err.message, 'red');
        }
    }

    // When ice framework discoveres new ice candidate, we should send it
    // to opponent, so he knows how to reach us
    onLocalIceCandidate(event) {
        if (event.candidate) {
            this.log('Send my ICE-candidate: ' + event.candidate.candidate, 'gray');
            this.sendIceCandidate(this.peerUser.userId, event.candidate);
        } else {
            this.log('No more candidates', 'gray');
        }
    }

    // Connectivity has changed? For example someone turned off wifi
    onIceConnectionStateChanged(event) {
        this.log('Connection state: ' + event.target.iceConnectionState, 'green');
    }

    onDataChannel(event) {
        if (!this.isInitiator) {
            this.openDataChannel(event.channel);
        }
    }

    openDataChannel(channel) {
        this.dataChannel = channel;
        Events.listen(this.dataChannel, this.dataChannelHandlers, this);
    }

    closeDataChannel() {
        Events.unlisten(this.dataChannel, this.dataChannelHandlers, this);
        this.dataChannel.close();
    }

    // NSC
    sendServerMessage(message) {
        this.socket.emit('server_message', {
            candidate: message
        });
    }

    // NSC
    /*sendData: function(data) {
        console.log('call sendData()');
        //sendChannel.send(data);
        this.dataChannel.send(data);
        //console.log('Sent Data: ' + data);
    },*/

    // Data channel
    sendMessage(message) {
        if (!this.dataChannelReady) {
            return;
        }
        this.dataChannel.send(message);
    }

    onDataChannelOpen() {
        this.dataChannelReady = true;
        this.emit('open');
    }

    // Слушает входящие сообщения от пиров
    onDataChannelMessage(event) {
        var obj = JSON.parse(event.data);
        var stor = new Storage();
        if (obj.type === "request") {
            var classification = stor.get(obj.site);

            // Отправляем на запросивший пир ответ
            var answer = {};
            answer.type = "answer";
            answer.site = obj.site;
            answer.classification = classification;
            debugLog("получен запрос на классификацию сайта " + answer.site + ", результат = " + answer.classification);

            var json = JSON.stringify(answer);
            room.peers[obj.peerId].sendMessage(json);
        // Установка полученной классификации или классификация своими силами
        } else if (obj.type === "answer") {
            // Сайт не смогли классифицировать
            if (obj.classification === null) {
                debugLog("сайт не смогли классифицировать");
            // Классификация сайта получена и его нужно сохранить в localStorage
            } else if (stor.get(obj.site) === null) {
                stor.set(obj.site, obj.classification);
                debugLog("получено и записано: сайт = " + obj.site + ", классификация = " + obj.classification);
            // Сайт уже классифицирован
            } else {
                debugLog("сайт уже классифицирован другим пиром");
            }
        // Добавление полученной классификации от других пиров
        } else if (obj.type === "add") {

        }
        //this.emit('message', MessageBuilder.deserialize(event.data));
    }

    onDataChannelClose() {
        this.dataChannelReady = false;
        this.emit('closed');
    }

    sendSdp(userId, sdp) {
        this.socket.emit('sdp', {
            userId: userId,
            sdp: sdp
        });
    }

    sendIceCandidate(userId, candidate) {
        this.socket.emit('ice_candidate', {
            userId: userId,
            candidate: candidate
        });
    }

    log(message, color) {
        console.log('%c[Peer-%d, %s] %s', 'color:' + color, this.peerUser.userId,
            this.peerConnection.signalingState, message);
    }
}

// RoomConnection.js
class RoomConnection extends Events.Emitter {
    constructor(roomName, socket) {
        super(); //this.parent();

        this.peers = null;
        this.socket = null;
        this.roomName = null;
        this.roomInfo = null;
        this.pendingSdp = null;
        this.pendidateCandidates = null;

        // Конструктор
        debugLog('Object RoomConnection created');
        window.room = this; // NSC

        this.socket = socket;
        this.roomName = roomName;
        this.pendingSdp = {};
        this.pendingCandidates = {};

        this.socketHandlers = {
            'sdp': this.onSdp,
            'ice_candidate': this.onIceCandidate,
            'room': this.onJoinedRoom,
            'user_join': this.onUserJoin,
            'user_ready': this.onUserReady,
            'user_leave': this.onUserLeave,
            'error': this.onError
        };

        this.peerConnectionHandlers = {
            'open': this.onPeerChannelOpen,
            'close': this.onPeerChannelClose,
            'message': this.onPeerMessage
        };

        Events.on(this.socket, this.socketHandlers, this);
    }

    getPeers() {

        debugLog('Peers table refresh');
        // Include styles
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = '#b282bc39cfe849aa8fb9940cfbdce51a{position:fixed;right:20px;top:50px;background:#fff;border-collapse:collapse}.c123490e089c41f18017fad9b973e9f4,.e08ba001706c4e18a3a4dd89a9e11b37{border:1px solid #000}';
        document.getElementsByTagName('head')[0].appendChild(style);

        var table = document.createElement('table');
        table.id = 'b282bc39cfe849aa8fb9940cfbdce51a';

        var tr = document.createElement('tr');

        var th1 = document.createElement('th');
        var th2 = document.createElement('th');
        var th3 = document.createElement('th');

        th1.className = 'c123490e089c41f18017fad9b973e9f4';
        th2.className = 'c123490e089c41f18017fad9b973e9f4';
        th3.className = 'c123490e089c41f18017fad9b973e9f4';

        var text1 = document.createTextNode('Peer ID');
        var text2 = document.createTextNode('Page');
        var text3 = document.createTextNode('Classification');

        th1.appendChild(text1);
        th2.appendChild(text2);
        th3.appendChild(text3);

        tr.appendChild(th1);
        tr.appendChild(th2);
        tr.appendChild(th3);

        table.appendChild(tr);

        for (var p in this.peers) {
            var tr = document.createElement('tr');

            var td1 = document.createElement('td');
            var td2 = document.createElement('td');
            var td3 = document.createElement('td');

            td1.className = 'e08ba001706c4e18a3a4dd89a9e11b37';
            td2.className = 'e08ba001706c4e18a3a4dd89a9e11b37';
            td3.className = 'e08ba001706c4e18a3a4dd89a9e11b37';

            var text1 = document.createTextNode(p.toString());
            var text2 = document.createTextNode('none');
            var text3 = document.createTextNode('none');

            td1.appendChild(text1);
            td2.appendChild(text2);
            td3.appendChild(text3);

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);

            table.appendChild(tr);
        }

        var element = document.getElementById('b282bc39cfe849aa8fb9940cfbdce51a');
        if (typeof(element) != 'undefined' && element != null) {
            document.body.replaceChild(table, element);
        } else {
            document.body.appendChild(table);
        }
    }

    destroy() {
        // TODO: вызвать метод родителя
        //this.parent();
        this.subscribers = null;
        Events.off(this.socket, this.socketHandlers, this);
    }

    connect() {
        this.sendJoin(this.roomName);
    }

    initPeerConnection(user, isInitiator) {
        // Create connection
        var cnt = new PeerConnection(this.socket, user, isInitiator);
        Events.on(cnt, this.peerConnectionHandlers, this, cnt, user);

        // Sometimes sdp|candidates may arrive before we initialized
        // peer connection, so not to loose the, we save them as pending
        var userId = user.userId;
        var pendingSdp = this.pendingSdp[userId];
        if (pendingSdp) {
            cnt.setSdp(pendingSdp);
            delete this.pendingSdp[userId];
        }
        var pendingCandidates = this.pendingCandidates[userId];
        if (pendingCandidates) {
            pendingCandidates.forEach(cnt.addIceCandidate, cnt);
            delete this.pendingCandidates[userId];
        }
        return cnt;
    }

    onSdp(message) {
        var userId = message.userId;
        if (!this.peers[userId]) {
            this.log('Adding pending sdp from another player. id = ' + userId, 'gray');
            this.pendingSdp[userId] = message.sdp;
            return;
        }
        this.peers[userId].setSdp(message.sdp);
    }

    onIceCandidate(message) {
        var userId = message.userId;
        if (!this.peers[userId]) {
            this.log('Adding pending candidate from another player. id =' + userId, 'gray');
            if (!this.pendingCandidates[userId]) {
                this.pendingCandidates[userId] = [];
            }
            this.pendingCandidates[userId].push(message.candidate);
            return;
        }
        this.peers[userId].addIceCandidate(message.candidate);
    }

    onJoinedRoom(roomInfo) {
        this.emit('joined', roomInfo);
        this.roomInfo = roomInfo;
        this.peers = {};
        for (var k in this.roomInfo.users) {
            var user = this.roomInfo.users[k];
            if (user.userId !== this.roomInfo.userId) {
                this.peers[user.userId] = this.initPeerConnection(this.roomInfo.users[k], true);
            }
        }
        this.getPeers();
    }

    onError(error) {
        this.log('Error connecting to room' + error.message, 'red');
    }

    onUserJoin(user) {
        this.log('Another player joined. id = ' + user.userId, 'orange');
        var peerConnection = this.initPeerConnection(user, false);
        this.roomInfo.users.push(user);
        this.peers[user.userId] = peerConnection;
        this.getPeers();
    }

    onUserReady(user) {
        this.log('Another player ready. id = ' + user.userId, 'orange');
        this.emit('user_ready', user);
    }

    onPeerChannelOpen(peer, user) {
        this.emit('peer_open', user, peer);
    }

    onPeerChannelClose(peer, user) {
        this.emit('peer_close', user, peer);
    }

    onPeerMessage(peer, user, message) {
        this.emit('peer_message', message, user, peer);
    }

    onUserLeave(goneUser) {
        try {
            if (!this.peers[goneUser.userId]) {
                return;
            }
            var cnt = this.peers[goneUser.userId];
            Events.off(cnt, this.peerConnectionHandlers, this);
            cnt.destroy(); // Тут случается ошибка "Cannot read property 'removeEventListener' of null"
            delete this.peers[goneUser.userId];
            delete this.roomInfo.users[goneUser.userId];
            this.emit('user_leave', goneUser);
            console.log('User ' + goneUser.userId + ' leave');
            this.getPeers();
        } catch(e) {
            exceptionLog('Исключение поймано для юзера ' + goneUser.userId);
            this.forceUserDelete(goneUser);
            //console.log(e);
        }
    }

    // TODO: переделать в finally
    forceUserDelete(goneUser) {
        delete this.peers[goneUser.userId];
        delete this.roomInfo.users[goneUser.userId];
        this.emit('user_leave', goneUser);
        console.log('User ' + goneUser.userId + ' drop');
        this.getPeers();
    }

    sendJoin(roomName) {
        this.socket.emit('join', {
            roomName: roomName
        });
    }

    sendLeave() {
        this.socket.emit(MessageType.LEAVE);
    }

    broadcastMessage(message) {
        this.broadcast(MessageBuilder.serialize(message));
    }

    sendMessageTo(userId, message) {
        console.log('Call sendMessageTo: ' + userId + ' ' + message);
        var peer = this.peers[userId];
        this.peerSend(peer, MessageBuilder.serialize(message));
    }

    broadcast(arrayBuffer) {
        for (var p in this.peers) {
            this.peerSend(this.peers[p], arrayBuffer);
        }
    }

    peerSend(peer, data) {
        peer.sendMessage(data);
    }

    log(message, color) {
        console.log('%c%s', 'color:' + color, message);
    }

    // Запрос классификации у пиров в сети
    siteClassification() {
        console.log("Debug: call siteClassification()");
        this.myBroadcast("request", window.location.hostname);
    }

    // NSC
    myBroadcast(type, site) {
        var obj = {};
        obj.type = type;
        obj.site = site;
        obj.peerId = window.localPeer;

        var json = JSON.stringify(obj);
        for (var p in this.peers) {
            console.log("Запрос на классификацию отправлен пиру: " + p);
            this.peers[p].sendMessage(json);
        }

        /*var category = getCategory();
        if (category !== null)
            console.log("Категория: " + category);
        else
            console.log("Категория не определена");*/
    }

    // NSC
    myLoadStorage() {
        var stor = new Storage();
        stor.set("nature.ru", "природа");
        stor.set("auto.ru", "автомобили");
        stor.set("news.ru", "новости");
    }
}

// GameRoom.js
class GameRoom {
    constructor(socketUrl) {
        this.roomId = null;
        this.roomConnection = null;
        this.socket = null;
        debugLog('My object GameRoom created');
        // Все подключения скидываем в одну комнату
        this.roomId = 1;
        //this.roomId = window.location.search.slice(1);
        this.socket = io(socketUrl);
        this.roomConnection = new RoomConnection(this.roomId, this.socket);
        this.roomConnection.on('joined', this.onJoinedRoom, this);
        this.roomConnection.connect();
    }

    onJoinedRoom(roomInfo) {
        console.log('%cJoined room', 'color: green', roomInfo);
        // TODO: ID текущего пира удалить из global
        // NSC
        window.localPeer = roomInfo.userId;
    }
}

class Storage {

    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            if (e == QUOTA_EXCEEDED_ERR)
                console.log("Local storage is full");
        }
    }
    
    get(key) {
        return localStorage.getItem(key);
    }

    // Отправка запроса: был ли кем-то классифицирован запрашиваемый сайт
    requestCategory() {

    }
}

// Категории
var keyWordDatabase = [];

var cat = {};
cat.name = "суд";
cat.dic = ["присяжн", "суд", "обвиня", "заключен", "приговор"];
keyWordDatabase.push(cat);

var cat = {};
cat.name = "природа";
cat.dic = ["дерев", "лес", "птицы", "животн", "растен"];
keyWordDatabase.push(cat);

var cat = {};
cat.name = "компьютеры";
cat.dic = ["памят", "процессор", "клавиатур", "мышь", "монитор"];
keyWordDatabase.push(cat);

// Общие слова, не несущие тематику
var wordsWithoutSubject = [
    "что",
    "был",
    "должен",
    "его",
    "было",
    "без",
    "чтобы",
    "ежел",
    "чем",
    "решил",
    "была",
    "так",
    "как",
    "сво"
];

function getCategory() {

    // Ищем все русские слова в тексте
    var regexp = /[АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя]+/ig;
    var result;
    var tokens = [];
    while (result = regexp.exec(document.documentElement.innerHTML)) {
        var token = {};
        // Пропускаем каждое слово через стеммер
        token.data = stem(result[0].toLowerCase());
        tokens.push(token);
    }

    // Создаем словарь частоты слов
    var frequency = [];
    for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].data in frequency)
            frequency[tokens[i].data]++;
        else
            frequency[tokens[i].data] = 1;
    }

    // Удаляем слова, не несущие тематику
    for (var item in frequency) {
        if (wordsWithoutSubject.indexOf(item) > 0)
            delete frequency[item];
    }

    // Удаляем слова, меньшие двух букв
    for (var item in frequency) {
        if (item.length <= 2)
            delete frequency[item];
    }

    // Удаляем все слова, повторяющиеся менее трех раз
    for (var item in frequency) {
        if (frequency[item] <= 2)
            delete frequency[item];
    }

    var words = [];
    for (var item in frequency) {
        var token = [];
        token.name = item;
        token.count = frequency[item];
        words.push(token);
    }

    // Сортируем словарь
    function compare(A, B) {
        return B.count - A.count;
    };
    words.sort(compare);

    // Определяем тематику текста, сложность O(n^2)
    var maxMatCat = null;
    var maxMatCatCount = 0;
    keyWordDatabase.forEach(function(item1) {

        var catCount = 0;
        item1.dic.forEach(function(item2) {

            words.forEach(function(item3) {
                if (item3.name === item2) {
                    catCount++;
                    //TODO: break;
                }
            });
        });
        if (catCount > maxMatCatCount) {
            maxMatCatCount = catCount;
            maxMatCat = item1.name;
        }
    });
    return maxMatCat;
};

//////////////////////////// Ukrstemmer.js

// ported from https://www.drupal.org/project/ukstemmer
var VOWEL = /аеиоуюяіїє/; /* http://uk.wikipedia.org/wiki/Голосний_звук */
var PERFECTIVEGROUND = /((ив|ивши|ившись|ыв|ывши|ывшись(в|вши|вшись)))$/;
// var PERFECTIVEGROUND = /((ив|ивши|ившись|ыв|ывши|ывшись((?<=[ая])(в|вши|вшись)))$/;
var REFLEXIVE = /(с[яьи])$/; // http://uk.wikipedia.org/wiki/Рефлексивне_дієслово
var ADJECTIVE = /(ый|ими|ій|ий|а|е|ова|ове|ів|є|їй|єє|еє|я|ім|ем|им|ім|их|іх|ою|йми|іми|у|ю|ого|ому|ої)$/; //http://uk.wikipedia.org/wiki/Прикметник + http://wapedia.mobi/uk/Прикметник
var PARTICIPLE = /(ий|ого|ому|им|ім|а|ій|у|ою|ій|і|их|йми|их)$/; //http://uk.wikipedia.org/wiki/Дієприкметник
var VERB = /(сь|ся|ив|ать|ять|у|ю|ав|али|учи|ячи|вши|ши|е|ме|ати|яти|є)$/; //http://uk.wikipedia.org/wiki/Дієслово
var NOUN = /(а|ев|ов|е|ями|ами|еи|и|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я|і|ові|ї|ею|єю|ою|є|еві|ем|єм|ів|їв|\'ю)$/; //http://uk.wikipedia.org/wiki/Іменник
var RVRE = /^(.*?[аеиоуюяіїє])(.*)$/;
var DERIVATIONAL = /[^аеиоуюяіїє][аеиоуюяіїє]+[^аеиоуюяіїє]+[аеиоуюяіїє].*сть?$/;
// var DERIVATIONAL = /[^аеиоуюяіїє][аеиоуюяіїє]+[^аеиоуюяіїє]+[аеиоуюяіїє].*(?<=о)сть?$/;

function stem(word) {
    if (word == null || !word.length) {
        return word;
    }
    word = word.toLowerCase();
    var stem = word;
    do {
        var p = word.match(RVRE);
        if (!p) break;

        var start = p[1];
        var RV = p[2];
        if (!RV) break;

        // Step 1
        var m = RV.replace(PERFECTIVEGROUND, '');
        if (m === RV) {
            RV = RV.replace(REFLEXIVE, '');

            m = RV.replace(ADJECTIVE, '');
            if (m === RV) {
                RV = RV.replace(PARTICIPLE, '');
            } else {
                RV = m;
                m = RV.replace(VERB, '');
                if (m === RV) {
                    RV = RV.replace(NOUN, '');
                } else {
                    RV = m;
                }
            }
        } else {
            RV = m;
        }

        // Step 2
        RV = RV.replace(/и$/, '');

        // Step 3
        if (DERIVATIONAL.test(RV)) {
            RV = RV.replace(/ость?$/, '');
        }

        // Step 4
        m = RV.replace(/ь$/, '');
        if (m === RV) {
            RV = RV.replace(/ейше?/, '');
            RV = RV.replace(/нн$/, 'н');
        } else {
            RV = m;
        }

        stem = start + RV;
    } while (false);
    return stem;
}

function debugLog(message) {
    if (DEBUG_MODE) {
        var date = new Date();
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
        console.log('%c[' + time + '] %s', 'color:' + COLOR_DEBUG, message);
    }
}

function exceptionLog(message) {
    if (DEBUG_MODE) {
        var date = new Date();
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
        console.log('%c[' + time + '] %s', 'color:' + COLOR_EXCEPTION, message);
    }
}

var log = console.log.bind(console);

// Старт приложения
//var gameRoom = new GameRoom('https://' + window.location.hostname); // Herokuapp
var gameRoom = new GameRoom('http://' + window.location.hostname + ':3000'); // Local client + local server
//var gameRoom = new GameRoom('https://webrtc-classif-network.herokuapp.com'); // Local client + remote server