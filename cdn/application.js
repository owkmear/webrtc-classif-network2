'use strict'

const DEBUG_MODE = true
const COLOR_DEBUG = 'blue'
const COLOR_EXCEPTION = 'red'
const RESPONSE_TIME = 1000 // Время на ожидание ответа о классификации от пиров
const TRAINING_MODE = true // Режим обучения, при котором пользователю предлагается задать классификацию вручную
const TRAINING_MODE_2 = false // Режим обучения, при котором определенная классификация добавляется в БД
const HOSTNAME = window.location.hostname
//var ROOT = 'http://localhost:3001';
const ROOT = 'https://signallingserverfe4e8e9b6b.herokuapp.com'

const answersFromPeers = [] // Для сбора ответов от пиров

class Classificator {
    constructor(name) {
        console.log('object Classificator was created')

        // Категории
        // TODO: интерфейс к работе с категориями: поиск категории, получение категории, добавление в словарь категории и прочее
        this.keyWordDatabase = []

        // Общие слова, не несущие тематику
        this.wordsWithoutSubject = null
    }

    // Интерфейс для хранения списка классифицированных сайтов
    storageSet(key, value) {
        try {
            localStorage.setItem(key, value)
        } catch (e) {
            if (e == QUOTA_EXCEEDED_ERR) console.log('Local storage is full')
        }
    }
    storageGet(key) {
        return localStorage.getItem(key)
    }

    /*var store = new Storage();
    store.set("nature.ru", "природа");
    store.set("auto.ru", "автомобили");
    store.set("news.ru", "новости");
    store.set("127.0.0.1", "цирк");*/

    loadKeyWordDatabaseLocal(database) {
        this.keyWordDatabase = database
    }

    loadKeyWordDatabase() {
        //this.keyWordDatabase = database; return;
        //console.log(this.loadDb());
        var db = this.keyWordDatabase
        var data = this.loadDb()
        //console.log(data);
        data.forEach(function (item1) {
            //console.log(item.category + ' ' + item.word + ' ' + item.weight);

            // Проверяем, создана ли категория. Если нет, то создаем, если есть - добавляем слово с весом
            var catExist = -1
            var count = 0
            db.forEach(function (item2) {
                if (item2.name === item1.category) catExist = count
                count++
            })
            if (catExist !== -1) {
                // Если категория есть

                // Проверка, есть ли в категории такое слово. Если есть, то пропускаем добавление, если нет - добавляем
                var wordExist = false
                db[catExist].dic.forEach(function (item3) {
                    //console.log(item);
                    if (item3.name === item1.name) wordExist = true
                })
                if (!wordExist) {
                    // Нет слова в категории
                    var item = {}
                    item.name = item1.word
                    //item.weight = item1.weight / 10;
                    item.weight = Number(item1.weight)
                    db[catExist].dic.push(item)
                }
            } else {
                // Если категории нет
                var cat = {}
                cat.name = item1.category
                cat.dic = []
                var item = {}
                item.name = item1.word
                item.weight = Number(item1.weight)
                //item.weight = item1.weight / 10;
                cat.dic.push(item)
                db.push(cat)
            }
        })
    }

    loadDb() {
        var result
        $.ajax({
            url: ROOT + '/keywords/',
            method: 'GET',
            success: function (data) {
                result = data
            },
            async: false
        })
        return result
    }

    saveDb() {
        var self = this
        console.log('call savedb()')
        this.keyWordDatabase.forEach(function (item1) {
            item1.dic.forEach(function (item2) {
                //console.log(item1.name + ' ' + item2.name + ' ' + item2.weight);
                self.addWord(item1.name, item2.name, item2.weight)
            })
        })
    }

    // Добавление или замена слова в БД
    addWord(cat, word, weight) {
        // Проверяем, есть ли такое слово. Если есть, то PUT, если нет - POST
        var db = this.loadDb()
        //console.log(db);
        var id = -1
        db.forEach(function (item) {
            if (item.category === cat && item.word === word) id = item.id
            //console.log(item);
        })
        if (id === -1) {
            // Нет слова - POST
            $.ajax({
                url: ROOT + '/keywords/',
                method: 'POST',
                data: { category: cat, word: word, weight: weight },
                success: function () {
                    //console.log('слово добавлено успешно');
                },
                async: false
            })
        } else {
            // Такое слово есть - PUT
            $.ajax({
                url: ROOT + '/keywords/' + id,
                method: 'PUT',
                data: { category: cat, word: word, weight: weight },
                success: function () {
                    //console.log('слово обновлено успешно');
                }
            })
        }
    }

    loadWordsWithoutSubject() {
        // TODO: загрузка со стороннего ресурса
        this.wordsWithoutSubject = [
            'что',
            'был',
            'должен',
            'его',
            'было',
            'без',
            'чтобы',
            'ежел',
            'чем',
            'решил',
            'была',
            'так',
            'как',
            'сво'
        ]
    }

    // На вход страница - document.documentElement.innerHTML
    getCategory(page) {
        //console.log(page);
        // Ищем все русские слова в тексте
        var regexp = /[АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя]+/gi
        var result
        var tokens = []
        while ((result = regexp.exec(page))) {
            var token = {}
            // Пропускаем каждое слово через стеммер
            token.data = this.stemmer(result[0].toLowerCase())
            tokens.push(token)
        }

        // Создаем словарь частоты слов
        var frequency = []
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i].data in frequency) frequency[tokens[i].data]++
            else frequency[tokens[i].data] = 1
        }
        //console.log(frequency);

        // Удаляем слова, не несущие тематику
        for (var item in frequency) {
            if (this.wordsWithoutSubject.indexOf(item) > 0) delete frequency[item]
        }

        // Удаляем слова, меньшие двух букв
        for (var item in frequency) {
            if (item.length <= 2) delete frequency[item]
        }

        // Удаляем все слова, повторяющиеся менее двух раз
        for (var item in frequency) {
            if (frequency[item] <= 1) delete frequency[item]
        }

        var words = []
        for (var item in frequency) {
            var token = []
            token.name = item
            token.count = frequency[item]
            words.push(token)
        }

        // Сортируем словарь
        function compare(A, B) {
            return B.count - A.count
        }
        words.sort(compare)

        // Определяем тематику текста, сложность O(n^2)
        var maxMatCat = null
        var maxMatCatCount = 0
        var categoryPoints = []
        this.keyWordDatabase.forEach(function (item1) {
            // суд

            var catCount = 0
            item1.dic.forEach(function (item2) {
                // присяжн (name: "присяжн", weight: 0.4)
                //console.log(item2);

                words.forEach(function (item3) {
                    // дорог
                    if (item3.name === item2.name) {
                        // дорог === присяжн
                        //catCount++;
                        catCount += item3.count * item2.weight
                        //console.log('Найдено: ' + item3.name + ' количество ' + item3.count + ' с весом ' + item2.weight);
                        //TODO: break;
                    }
                })
            })
            //console.log(item1.name + ' = ' + catCount);

            // Выводим только найденные категории
            if (catCount > 0) {
                var cat = {}
                cat.name = item1.name
                cat.points = catCount
                categoryPoints.push(cat)
            }
            if (catCount > maxMatCatCount) {
                maxMatCatCount = catCount
                maxMatCat = item1.name
            }
        })

        //console.log(categoryPoints);
        categoryPoints.forEach(function (item) {
            console.log(item.name + ' = ' + item.points.toFixed(1) + ' очков')
        })
        //console.log('Размер = ' + categoryPoints.length);

        //console.log(words);
        words.forEach(function (item) {
            console.log('Найдено: ' + item.name + ' - ' + item.count)
        })

        if (TRAINING_MODE_2) {
            if (maxMatCat === null) maxMatCat = prompt('Категория сайта не определена\n\nВведите категорию:')

            this.addDataToDb(maxMatCat, words)

            this.saveDb()
            console.log('Режим обучения включен')
        } else console.log('Режим обучения выключен')

        return maxMatCat
    }

    stemmer(word) {
        var DICT = {
            RVRE: /^(.*?[аеиоуыэюя])(.*)$/i,
            PERFECTIVEGROUND_1: /([ая])(в|вши|вшись)$/gi,
            PERFECTIVEGROUND_2: /(ив|ивши|ившись|ыв|ывши|ывшись)$/i,
            REFLEXIVE: /(с[яь])$/i,
            ADJECTIVE: /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/i,
            PARTICIPLE_1: /([ая])(ем|нн|вш|ющ|щ)$/gi,
            PARTICIPLE_2: /(ивш|ывш|ующ)$/i,
            VERB_1: /([ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/gi,
            VERB_2:
                /(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/i,
            NOUN: /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/i,
            DERIVATIONAL: /.*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$/i,
            DER: /ость?$/i,
            SUPERLATIVE: /(ейше|ейш)$/i,
            I: /и$/i,
            P: /ь$/i,
            NN: /нн$/i
        }

        word = word.replace(/ё/gi, 'e')
        var wParts = word.match(DICT.RVRE)
        if (!wParts) {
            return word
        }
        var start = wParts[1]
        var rv = wParts[2]
        var temp = rv.replace(DICT.PERFECTIVEGROUND_2, '')
        if (temp == rv) {
            temp = rv.replace(DICT.PERFECTIVEGROUND_1, '$1')
        }
        if (temp == rv) {
            rv = rv.replace(DICT.REFLEXIVE, '')
            temp = rv.replace(DICT.ADJECTIVE, '')
            if (temp != rv) {
                rv = temp
                temp = rv.replace(DICT.PARTICIPLE_2, '')
                if (temp == rv) {
                    rv = rv.replace(DICT.PARTICIPLE_1, '$1')
                }
            } else {
                temp = rv.replace(DICT.VERB_2, '')
                if (temp == rv) {
                    temp = rv.replace(DICT.VERB_1, '$1')
                }
                if (temp == rv) {
                    rv = rv.replace(DICT.NOUN, '')
                } else {
                    rv = temp
                }
            }
        } else {
            rv = temp
        }
        rv = rv.replace(DICT.I, '')
        if (rv.match(DICT.DERIVATIONAL)) {
            rv = rv.replace(DICT.DER, '')
        }
        temp = rv.replace(DICT.P, '')
        if (temp == rv) {
            rv = rv.replace(DICT.SUPERLATIVE, '')
            rv = rv.replace(DICT.NN, 'н')
        } else {
            rv = temp
        }
        return start + rv
    }

    // Вывод БД
    getDb() {
        this.keyWordDatabase.forEach(function (item1) {
            console.log('Категория: ' + item1.name)
            item1.dic.forEach(function (item2) {
                // name: "присяжн", weight: 0.4
                console.log('  * ' + item2.name + ' ' + item2.weight)
            })
        })
    }

    // Добавление в БД новых данных по категории
    addDataToDb(catName, words) {
        // Проверка наличия категории. Если ее нет, то создаем новую и заносим в нее данные
        var db = this.keyWordDatabase
        var exist = -1
        var count = 0
        this.keyWordDatabase.forEach(function (item) {
            // суд
            if (item.name === catName) exist = count
            count++
        })
        var max = 0
        words.forEach(function (item) {
            if (item.count > max) max = item.count
        })
        /*for (key in words) {
            if (words[key].name === cat)
                exist = key;
        }*/
        //console.log('exist = ' + exist);
        if (exist !== -1) {
            //console.log('Категория ' + cat + ' уже есть, сливаем данные');

            //console.log(this.keyWordDatabase[exist].dic);
            //return;
            words.forEach(function (item1) {
                // заключен 8
                var existWord = -1
                var count = 0
                //console.log(db);
                //for (key in this.keyWordDatabase[exist].dic) {
                //console.log(key);
                //}
                db[exist].dic.forEach(function (item2) {
                    // name: "присяжн", weight: 0.4
                    if (item1.name === item2.name) existWord = count
                    count++
                })
                //console.log('existWord = ' + existWord);
                if (existWord !== -1) {
                    //console.log('Сливаем ' + item1.name);
                    db[exist].dic[existWord].weight = Number(
                        ((db[exist].dic[existWord].weight + item1.count / max) / 2).toFixed(1)
                    )
                } else {
                    //console.log('Добавляем ' + item1.name);
                    var newItem = {}
                    newItem.name = item1.name
                    newItem.weight = Number((item1.count / max).toFixed(1))
                    db[exist].dic.push(newItem)
                }
            })
        } else {
            console.log('Категории ' + catName + ' нет, создаем новую категорию')

            var cat = {}
            cat.name = catName
            cat.dic = []
            //console.log(words)
            words.forEach(function (item) {
                var newItem = {}
                newItem.name = item.name
                newItem.weight = Number((item.count / max).toFixed(1))
                cat.dic.push(newItem)
            })
            db.push(cat)
        }
    }
}

// Events.js
class EventEmitter {
    constructor() {
        debugLog('Object Events created')

        this.lastToken = 0
        //this.subscribers = null;
        this.subscribers = {}
    }

    destroy() {
        this.subscribers = null
    }

    emit(event) {
        var emitArgs = [].slice.call(arguments, 1)
        for (var k in this.subscribers) {
            var scb = this.subscribers[k]
            if (scb.event === event) {
                scb.subscriber.apply(scb.ctx, emitArgs)
            }
        }
    }

    on(event, subscriber, ctx) {
        var token = ++this.lastToken
        this.subscribers[token] = {
            event: event,
            subscriber: subscriber,
            ctx: ctx
        }
        return token
    }

    off(token) {
        delete this.subscribers[token]
    }
}

var Events = {
    Emitter: EventEmitter,

    listen: function () {
        this._listen('addEventListener', arguments)
    },

    unlisten: function () {
        this._unlisten('removeEventListener', arguments)
    },

    on: function () {
        this._listen('on', arguments)
    },

    off: function () {
        this._unlisten('off', arguments)
    },

    _listen: function (method, argsObject) {
        var args = [].slice.apply(argsObject)
        var object = args[0]
        var handlers = args[1]
        var context = args[2]
        var bindArgs = args.slice(2)
        for (var k in handlers) {
            var bound = (context[k + '_bound'] = handlers[k].bind.apply(handlers[k], bindArgs))
            object[method](k, bound)
        }
    },

    _unlisten: function (method, args) {
        var object = args[0]
        var handlers = args[1]
        var context = args[2]
        for (var k in handlers) {
            object[method](k, context[k + '_bound'])
        }
    }
}

// PeerConnection.js
class PeerConnection extends Events.Emitter {
    constructor(socket, peerUser, isInitiator) {
        super() // this.parent();

        this.CHANNEL_NAME = 'data'

        this.iceServers = [
            {
                url: 'stun:stun.l.google.com:19302'
            },
            {
                url: 'stun:stun.anyfirewall.com:3478'
            },
            {
                url: 'turn:turn.bistri.com:80',
                credential: 'homeo',
                username: 'homeo'
            },
            {
                url: 'turn:turn.anyfirewall.com:443?transport=tcp',
                credential: 'webrtc',
                username: 'webrtc'
            }
        ]

        this.socket = null
        this.isInitiator = false
        this.dataChannelReady = false
        this.peerConnection = null
        this.dataChannel = null
        this.remoteDescriptionReady = false
        this.pendingCandidates = null
        this.lastMessageOrd = null

        // Сам конструктор
        //window.peer = this;
        debugLog('Object PeerConnection created')

        this.socket = socket
        this.peerUser = peerUser
        this.isInitiator = isInitiator
        this.pendingCandidates = []
        this.peerHandlers = {
            icecandidate: this.onLocalIceCandidate,
            iceconnectionstatechange: this.onIceConnectionStateChanged,
            datachannel: this.onDataChannel
        }
        this.dataChannelHandlers = {
            open: this.onDataChannelOpen,
            close: this.onDataChannelClose,
            message: this.onDataChannelMessage
        }
        this.connect()
    }

    destroy() {
        // TODO: вызвать метод родителя
        //this.parent();
        this.subscribers = null

        this.closePeerConnection()
    }

    connect() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        })
        Events.listen(this.peerConnection, this.peerHandlers, this)
        if (this.isInitiator) {
            this.openDataChannel(
                this.peerConnection.createDataChannel(this.CHANNEL_NAME, {
                    ordered: false
                })
            )
        }
        if (this.isInitiator) {
            this.setLocalDescriptionAndSend()
        }
    }

    closePeerConnection() {
        this.closeDataChannel()
        Events.unlisten(this.peerConnection, this.peerHandlers, this)
        if (this.peerConnection.signalingState !== 'closed') {
            this.peerConnection.close()
        }
    }

    setSdp(sdp) {
        var self = this
        // Create session description from sdp data
        var rsd = new RTCSessionDescription(sdp)
        // And set it as remote description for peer connection
        self.peerConnection.setRemoteDescription(rsd).then(function () {
            self.remoteDescriptionReady = true
            self.log('Got SDP from remote peer', 'green')
            // Add all received remote candidates
            while (self.pendingCandidates.length) {
                self.addRemoteCandidate(self.pendingCandidates.pop())
            }
            // Got offer? send answer
            if (!self.isInitiator) {
                self.setLocalDescriptionAndSend()
            }
        })
    }

    setLocalDescriptionAndSend() {
        var self = this
        self
            .getDescription()
            .then(function (localDescription) {
                self.peerConnection.setLocalDescription(localDescription).then(function () {
                    self.log('Sending SDP', 'green')
                    self.sendSdp(self.peerUser.userId, localDescription)
                })
            })
            .catch(function (error) {
                self.log('onSdpError: ' + error.message, 'red')
            })
    }

    getDescription() {
        return this.isInitiator ? this.peerConnection.createOffer() : this.peerConnection.createAnswer()
    }

    addIceCandidate(candidate) {
        if (this.remoteDescriptionReady) {
            this.addRemoteCandidate(candidate)
        } else {
            this.pendingCandidates.push(candidate)
        }
    }

    addRemoteCandidate(candidate) {
        try {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            this.log('Added his ICE-candidate:' + candidate.candidate, 'gray')
        } catch (err) {
            this.log('Error adding remote ice candidate' + err.message, 'red')
        }
    }

    // When ice framework discoveres new ice candidate, we should send it
    // to opponent, so he knows how to reach us
    onLocalIceCandidate(event) {
        if (event.candidate) {
            this.log('Send my ICE-candidate: ' + event.candidate.candidate, 'gray')
            this.sendIceCandidate(this.peerUser.userId, event.candidate)
        } else {
            this.log('No more candidates', 'gray')
        }
    }

    // Connectivity has changed? For example someone turned off wifi
    onIceConnectionStateChanged(event) {
        this.log('Connection state: ' + event.target.iceConnectionState, 'green')
    }

    onDataChannel(event) {
        if (!this.isInitiator) {
            this.openDataChannel(event.channel)
        }
    }

    openDataChannel(channel) {
        this.dataChannel = channel
        Events.listen(this.dataChannel, this.dataChannelHandlers, this)
    }

    closeDataChannel() {
        Events.unlisten(this.dataChannel, this.dataChannelHandlers, this)
        this.dataChannel.close()
    }

    // NSC
    sendServerMessage(message) {
        this.socket.emit('server_message', {
            candidate: message
        })
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
        /*if (!this.dataChannelReady) {
            exceptionLog('Data channel is not ready');
            return;
        }*/

        // TODO: ловить эксепшион bag_1
        this.dataChannel.send(message)
    }

    onDataChannelOpen() {
        debugLog('call onDataChannelOpen()')
        this.dataChannelReady = true
        this.emit('open')
    }

    // Слушает входящие сообщения от пиров
    onDataChannelMessage(event) {
        var obj = JSON.parse(event.data)
        //var stor = new Storage();
        if (obj.type === 'сlassifReq') {
            var classification = store.get(obj.site)

            // Готовим ответ
            var answer = {}
            answer.type = 'сlassifReqAnswer'
            answer.site = obj.site
            answer.classification = classification
            debugLog('Получен запрос на классификацию сайта ' + answer.site + ', результат = ' + answer.classification)

            // Отправляем на запросивший пир ответ
            var json = JSON.stringify(answer)
            room.peers[obj.peerId].sendMessage(json)
        } else if (obj.type === 'setClassif') {
            //var classification = stor.set(obj.site);

            // Отправляем на запросивший пир ответ
            /*var answer = {};
            answer.type = "answer";
            answer.site = obj.site;
            answer.classification = classification;*/
            debugLog('получен запрос на установку классификации сайта')
        }

        // Установка полученной классификации или классификация своими силами
        else if (obj.type === 'сlassifReqAnswer') {
            // TODO: переделать обращение к глабольной переменной
            var answer = {}
            answer.classification = obj.classification
            answer.type = obj.type
            answer.site = obj.site
            answersFromPeers.push(answer)

            // TODO: переделать обращение к глабольной переменной
            room.peerAnswers--

            // Сайт не смогли классифицировать
            if (obj.classification === null) {
                debugLog('Сайт не смогли классифицировать')
            }

            // Классификация сайта получена и его нужно сохранить в localStorage
            else if (store.get(obj.site) === null) {
                store.set(obj.site, obj.classification)
                debugLog('Получено и записано: сайт = ' + obj.site + ', классификация = ' + obj.classification)

                // Сайт уже классифицирован
            } else {
                debugLog('Сайт уже классифицирован другим пиром')
            }
        } else exceptionLog('Получен неверный формат сообщения от других пиров')
        //this.emit('message', MessageBuilder.deserialize(event.data));
    }

    onDataChannelClose() {
        this.dataChannelReady = false
        this.emit('closed')
    }

    sendSdp(userId, sdp) {
        this.socket.emit('sdp', {
            userId: userId,
            sdp: sdp
        })
    }

    sendIceCandidate(userId, candidate) {
        this.socket.emit('ice_candidate', {
            userId: userId,
            candidate: candidate
        })
    }

    log(message, color) {
        console.log(
            '%c[Peer-%d, %s] %s',
            'color:' + color,
            this.peerUser.userId,
            this.peerConnection.signalingState,
            message
        )
    }
}

// RoomConnection.js
class RoomConnection extends Events.Emitter {
    constructor(roomName, socket) {
        super() //this.parent();

        this.peers = null
        this.socket = null
        this.roomName = null
        this.roomInfo = null
        this.pendingSdp = null
        this.pendidateCandidates = null

        // Конструктор
        debugLog('Object RoomConnection created')
        window.room = this // NSC

        this.socket = socket
        this.roomName = roomName
        this.pendingSdp = {}
        this.pendingCandidates = {}
        this.peerAnswers = 0

        this.socketHandlers = {
            sdp: this.onSdp,
            ice_candidate: this.onIceCandidate,
            room: this.onJoinedRoom,
            user_join: this.onUserJoin,
            user_ready: this.onUserReady,
            user_leave: this.onUserLeave,
            error: this.onError
        }

        this.peerConnectionHandlers = {
            open: this.onPeerChannelOpen,
            close: this.onPeerChannelClose,
            message: this.onPeerMessage
        }

        Events.on(this.socket, this.socketHandlers, this)
    }

    getPeers() {
        debugLog('Peers table refresh')
        // Include styles
        var style = document.createElement('style')
        style.type = 'text/css'
        style.innerHTML =
            '#b282bc39cfe849aa8fb9940cfbdce51a{position:fixed;right:20px;top:50px;background:#fff;border-collapse:collapse}.c123490e089c41f18017fad9b973e9f4,.e08ba001706c4e18a3a4dd89a9e11b37{border:1px solid #000}'
        document.getElementsByTagName('head')[0].appendChild(style)

        var table = document.createElement('table')
        table.id = 'b282bc39cfe849aa8fb9940cfbdce51a'

        var tr = document.createElement('tr')

        var th1 = document.createElement('th')
        var th2 = document.createElement('th')
        var th3 = document.createElement('th')

        th1.className = 'c123490e089c41f18017fad9b973e9f4'
        th2.className = 'c123490e089c41f18017fad9b973e9f4'
        th3.className = 'c123490e089c41f18017fad9b973e9f4'

        var text1 = document.createTextNode('Peer ID')
        var text2 = document.createTextNode('Page')
        var text3 = document.createTextNode('Classification')

        th1.appendChild(text1)
        th2.appendChild(text2)
        th3.appendChild(text3)

        tr.appendChild(th1)
        tr.appendChild(th2)
        tr.appendChild(th3)

        table.appendChild(tr)

        for (var p in this.peers) {
            var tr = document.createElement('tr')

            var td1 = document.createElement('td')
            var td2 = document.createElement('td')
            var td3 = document.createElement('td')

            td1.className = 'e08ba001706c4e18a3a4dd89a9e11b37'
            td2.className = 'e08ba001706c4e18a3a4dd89a9e11b37'
            td3.className = 'e08ba001706c4e18a3a4dd89a9e11b37'

            var text1 = document.createTextNode(p.toString())
            var text2 = document.createTextNode('none')
            var text3 = document.createTextNode('none')

            td1.appendChild(text1)
            td2.appendChild(text2)
            td3.appendChild(text3)

            tr.appendChild(td1)
            tr.appendChild(td2)
            tr.appendChild(td3)

            table.appendChild(tr)
        }

        var element = document.getElementById('b282bc39cfe849aa8fb9940cfbdce51a')
        if (typeof element != 'undefined' && element != null) {
            document.body.replaceChild(table, element)
        } else {
            document.body.appendChild(table)
        }
    }

    destroy() {
        // TODO: вызвать метод родителя
        //this.parent();
        this.subscribers = null
        Events.off(this.socket, this.socketHandlers, this)
    }

    connect() {
        this.sendJoin(this.roomName)
    }

    initPeerConnection(user, isInitiator) {
        // Create connection
        var cnt = new PeerConnection(this.socket, user, isInitiator)
        Events.on(cnt, this.peerConnectionHandlers, this, cnt, user)

        // Sometimes sdp|candidates may arrive before we initialized
        // peer connection, so not to loose the, we save them as pending
        var userId = user.userId
        var pendingSdp = this.pendingSdp[userId]
        if (pendingSdp) {
            cnt.setSdp(pendingSdp)
            delete this.pendingSdp[userId]
        }
        var pendingCandidates = this.pendingCandidates[userId]
        if (pendingCandidates) {
            pendingCandidates.forEach(cnt.addIceCandidate, cnt)
            delete this.pendingCandidates[userId]
        }
        return cnt
    }

    onSdp(message) {
        var userId = message.userId
        if (!this.peers[userId]) {
            this.log('Adding pending sdp from another player. id = ' + userId, 'gray')
            this.pendingSdp[userId] = message.sdp
            return
        }
        this.peers[userId].setSdp(message.sdp)
    }

    onIceCandidate(message) {
        var userId = message.userId
        if (!this.peers[userId]) {
            this.log('Adding pending candidate from another player. id =' + userId, 'gray')
            if (!this.pendingCandidates[userId]) {
                this.pendingCandidates[userId] = []
            }
            this.pendingCandidates[userId].push(message.candidate)
            return
        }
        this.peers[userId].addIceCandidate(message.candidate)
    }

    onJoinedRoom(roomInfo) {
        this.emit('joined', roomInfo)
        this.roomInfo = roomInfo
        this.peers = {}
        for (var k in this.roomInfo.users) {
            var user = this.roomInfo.users[k]
            if (user.userId !== this.roomInfo.userId) {
                this.peers[user.userId] = this.initPeerConnection(this.roomInfo.users[k], true)
            }
        }
        this.getPeers()
    }

    onError(error) {
        this.log('Error connecting to room' + error.message, 'red')
    }

    onUserJoin(user) {
        this.log('Another player joined. id = ' + user.userId, 'orange')
        var peerConnection = this.initPeerConnection(user, false)
        this.roomInfo.users.push(user)
        this.peers[user.userId] = peerConnection
        this.getPeers()
    }

    onUserReady(user) {
        this.log('Another player ready. id = ' + user.userId, 'orange')
        this.emit('user_ready', user)
    }

    onPeerChannelOpen(peer, user) {
        this.emit('peer_open', user, peer)
    }

    onPeerChannelClose(peer, user) {
        this.emit('peer_close', user, peer)
    }

    onPeerMessage(peer, user, message) {
        this.emit('peer_message', message, user, peer)
    }

    onUserLeave(goneUser) {
        try {
            if (!this.peers[goneUser.userId]) {
                return
            }
            var cnt = this.peers[goneUser.userId]
            Events.off(cnt, this.peerConnectionHandlers, this)
            cnt.destroy() // Тут случается ошибка "Cannot read property 'removeEventListener' of null"
            delete this.peers[goneUser.userId]
            delete this.roomInfo.users[goneUser.userId]
            this.emit('user_leave', goneUser)
            console.log('User ' + goneUser.userId + ' leave')
            this.getPeers()
        } catch (e) {
            exceptionLog('Исключение поймано для юзера ' + goneUser.userId)
            this.forceUserDelete(goneUser)
            //console.log(e);
        }
    }

    // TODO: переделать в finally
    forceUserDelete(goneUser) {
        delete this.peers[goneUser.userId]
        delete this.roomInfo.users[goneUser.userId]
        this.emit('user_leave', goneUser)
        console.log('User ' + goneUser.userId + ' drop')
        this.getPeers()
    }

    sendJoin(roomName) {
        this.socket.emit('join', {
            roomName: roomName
        })
    }

    sendLeave() {
        this.socket.emit(MessageType.LEAVE)
    }

    broadcastMessage(message) {
        this.broadcast(MessageBuilder.serialize(message))
    }

    sendMessageTo(userId, message) {
        console.log('Call sendMessageTo: ' + userId + ' ' + message)
        var peer = this.peers[userId]
        this.peerSend(peer, MessageBuilder.serialize(message))
    }

    broadcast(arrayBuffer) {
        for (var p in this.peers) {
            this.peerSend(this.peers[p], arrayBuffer)
        }
    }

    peerSend(peer, data) {
        peer.sendMessage(data)
    }

    log(message, color) {
        console.log('%c%s', 'color:' + color, message)
    }

    // Запрос классификации у пиров в сети
    classifReq() {
        debugLog('call сlassifReq()')
        this.broadcast('сlassifReq', HOSTNAME)

        // Ожидание ответа от пиров, после чего выполняется принятие решения о классификации
        setTimeout(function () {
            console.log(answersFromPeers)
            answersFromPeers.forEach(function (item) {
                debugLog('classification = ' + item.classification + ' site = ' + item.site)
            })

            //////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////
            //////////////////////////////////////////////////////////////

            /*var item = {};
            item.classification = 'погода';
            item.site = 'wether.ru';
            answersFromPeers.push(item);

            var item = {};
            item.classification = 'погода';
            item.site = 'wether.ru';
            answersFromPeers.push(item);

            var item = {};
            item.classification = 'погода';
            item.site = 'wether.ru';
            answersFromPeers.push(item);

            var item = {};
            item.classification = 'гадание';
            item.site = 'wether.ru';
            answersFromPeers.push(item);

            var item = {};
            item.classification = 'null';
            item.site = 'wether.ru';
            answersFromPeers.push(item);

            var item = {};
            item.classification = 'null';
            item.site = 'wether.ru';
            answersFromPeers.push(item);*/

            /*answersFromPeers.forEach(function(item){
                console.log(item.site);
            });*/

            // Создаем словарь частоты
            var frequency = []
            var count = 0
            for (var i = 0; i < answersFromPeers.length; i++) {
                if (answersFromPeers[i].classification !== 'null') {
                    count++
                    if (answersFromPeers[i].classification in frequency) frequency[answersFromPeers[i].classification]++
                    else frequency[answersFromPeers[i].classification] = 1
                }
            }
            if (count === 0) {
                debugLog('Категория не определена')

                // TODO: ручной ввод классификакции сайта
                if (TRAINING_MODE) {
                    var classification = prompt('Введите классификацию сайта')
                    debugLog('Сохраняем ручную классификацию ' + classification + ' для сайта ' + HOSTNAME)
                }
            } else {
                var maxCount = 0
                var maxCat = ''
                for (var item in frequency) {
                    if (frequency[item] > maxCount) {
                        maxCount = frequency[item]
                        maxCat = item
                    }
                }

                console.log('Топ Категория = ' + maxCat)
                console.log('Топ стат = ' + maxCount)
                console.log('count = ' + count)

                debugLog('Сохраняем классификацию ' + maxCat + ' для сайта ' + HOSTNAME)
            }
            answersFromPeers = []
        }, RESPONSE_TIME)
    }

    // Установить классификацию для остальных
    setClassif() {
        debugLog('call setClassif()')
        this.broadcast('setClassif', window.location.hostname)
    }

    // NSC
    broadcast(type, site) {
        var obj = {}
        obj.type = type
        obj.site = site
        obj.peerId = window.localPeer

        var json = JSON.stringify(obj)
        for (var p in this.peers) {
            debugLog('Запрос отправлен пиру: ' + p)
            this.peers[p].sendMessage(json)
            this.peerAnswers++
        }

        /*var category = getCategory();
        if (category !== null)
            console.log("Категория: " + category);
        else
            console.log("Категория не определена");*/
    }

    // NSC
    /*myLoadStorage() {
        //var store = new Storage();
        store.set("nature.ru", "природа");
        store.set("auto.ru", "автомобили");
        store.set("news.ru", "новости");
        store.set("127.0.0.1", "нет классификации");
    }*/
}

// Application.js
class GameRoom {
    constructor(socketUrl) {
        this.roomId = null
        this.roomConnection = null
        this.socket = null
        debugLog('My object Application created')
        // Все подключения скидываем в одну комнату
        this.roomId = 1
        //this.roomId = window.location.search.slice(1);
        this.socket = io(socketUrl)
        this.roomConnection = new RoomConnection(this.roomId, this.socket)
        this.roomConnection.on('joined', this.onJoinedRoom, this)
        this.roomConnection.connect()
    }

    onJoinedRoom(roomInfo) {
        console.log('%cJoined room', 'color: green', roomInfo)
        // TODO: ID текущего пира удалить из global
        // NSC
        window.localPeer = roomInfo.userId
    }
}

function test() {
    window.c = new Classificator()

    // TODO: загрузка со стороннего ресурса
    /*var keyWordDatabase = [];
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
    c.loadKeyWordDatabase(keyWordDatabase);*/

    /*var keyWordDatabase = [];

    var cat = {};
    cat.name = "суд";
    cat.dic = [];
    var item = {}; item.name = "присяжн"; item.weight = 0.4; cat.dic.push(item);
    var item = {}; item.name = "суд"; item.weight = 0.8; cat.dic.push(item);
    var item = {}; item.name = "обвиня"; item.weight = 0.7; cat.dic.push(item);
    var item = {}; item.name = "заключен"; item.weight = 0.3; cat.dic.push(item);
    var item = {}; item.name = "приговорен"; item.weight = 0.7; cat.dic.push(item);
    keyWordDatabase.push(cat);

    var cat = {};
    cat.name = "природа";
    cat.dic = [];
    var item = {}; item.name = "дерев"; item.weight = 0.1; cat.dic.push(item);
    var item = {}; item.name = "лесн"; item.weight = 0.3; cat.dic.push(item);
    var item = {}; item.name = "птиц"; item.weight = 0.6; cat.dic.push(item);
    var item = {}; item.name = "животн"; item.weight = 0.5; cat.dic.push(item);
    var item = {}; item.name = "растен"; item.weight = 0.7; cat.dic.push(item);
    keyWordDatabase.push(cat);

    var cat = {};
    cat.name = "компьютеры";
    cat.dic = [];
    var item = {}; item.name = "памят"; item.weight = 0.9; cat.dic.push(item);
    var item = {}; item.name = "процессорн"; item.weight = 0.8; cat.dic.push(item);
    var item = {}; item.name = "клавиатур"; item.weight = 0.4; cat.dic.push(item);
    var item = {}; item.name = "мыш"; item.weight = 0.5; cat.dic.push(item);
    var item = {}; item.name = "монитор"; item.weight = 0.6; cat.dic.push(item);
    keyWordDatabase.push(cat);*/

    /*var cat = {};
    cat.name = "суд";
    cat.dic = [];
    cat.dic.push({"присяжн": 0.4});
    cat.dic.push({"суд": 0.8});
    cat.dic.push({"обвиня": 0.7});
    cat.dic.push({"заключен": 0.3});
    cat.dic.push({"приговор": 0.5});
    keyWordDatabase.push(cat);

    var cat = {};
    cat.name = "природа";
    cat.dic = [];
    cat.dic.push({"дерев": 0.1});
    cat.dic.push({"лес": 0.3});
    cat.dic.push({"птицы": 0.6});
    cat.dic.push({"животн": 0.5});
    cat.dic.push({"растен": 0.7});
    keyWordDatabase.push(cat);

    var cat = {};
    cat.name = "компьютеры";
    cat.dic = [];
    cat.dic.push({"памят": 0.9});
    cat.dic.push({"процессор": 0.3});
    cat.dic.push({"клавиатур": 0.6});
    cat.dic.push({"мышь": 0.4});
    cat.dic.push({"монитор": 0.7});
    keyWordDatabase.push(cat);*/

    //c.loadKeyWordDatabase(keyWordDatabase);
    c.loadKeyWordDatabase()

    c.loadWordsWithoutSubject()
    debugLog('Категория: ' + c.getCategory(document.documentElement.innerHTML))
}
test()

function debugLog(message) {
    if (DEBUG_MODE) {
        var date = new Date()
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds()
        console.log('%c[' + time + '] %s', 'color:' + COLOR_DEBUG, message)
    }
}

function exceptionLog(message) {
    if (DEBUG_MODE) {
        var date = new Date()
        var time = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds()
        console.log('%c[' + time + '] %s', 'color:' + COLOR_EXCEPTION, message)
    }
}

var log = console.log.bind(console)

// Старт приложения
//var gameRoom = new GameRoom('https://' + window.location.hostname); // Herokuapp
var gameRoom = new GameRoom('http://' + window.location.hostname + ':3000') // Local client + local server
//var gameRoom = new GameRoom('https://webrtc-classif-network.herokuapp.com'); // Local client + remote server
