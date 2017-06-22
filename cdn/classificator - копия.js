class Classificator {

    constructor(name) {
        console.log('object Classificator was created');
        
        // Категории
        // TODO: интерфейс к работе с категориями: поиск категории, получение категории, добавление в словарь категории и прочее
        this.keyWordDatabase = [];
        
        // Общие слова, не несущие тематику
        this.wordsWithoutSubject = null;
    }
    
    // Интерфейс для хранения списка классифицированных сайтов
    storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            if (e == QUOTA_EXCEEDED_ERR)
                console.log("Local storage is full");
        }
    }
    storageGet(key) {
        return localStorage.getItem(key);
    }

    /*var store = new Storage();
    store.set("nature.ru", "природа");
    store.set("auto.ru", "автомобили");
    store.set("news.ru", "новости");
    store.set("127.0.0.1", "цирк");*/
    
    loadKeyWordDatabase(database) {
        this.keyWordDatabase = database;

    }
    
    loadWordsWithoutSubject() {
        // TODO: загрузка со стороннего ресурса
        this.wordsWithoutSubject = [
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
    }

    // На вход страница - document.documentElement.innerHTML
    getCategory(page) {

        // Ищем все русские слова в тексте
        var regexp = /[АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя]+/ig;
        var result;
        var tokens = [];
        while (result = regexp.exec(page)) {
            var token = {};
            // Пропускаем каждое слово через стеммер
            token.data = this.stemmer(result[0].toLowerCase());
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
        //console.log(frequency);

        // Удаляем слова, не несущие тематику
        for (var item in frequency) {
            if (this.wordsWithoutSubject.indexOf(item) > 0)
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

        //console.log(words);
        
        // Определяем тематику текста, сложность O(n^2)
        var maxMatCat = null;
        var maxMatCatCount = 0;
        this.keyWordDatabase.forEach(function(item1) { // суд

            var catCount = 0;
            item1.dic.forEach(function(item2) { // присяжн

                words.forEach(function(item3) { // дорог
                    if (item3.name === item2) { // дорог === присяжн
                        catCount++;
                        console.log('Найдено: ' + item2);
                        //TODO: break;
                    }
                });
            });
            console.log(item1.name + ' = ' + catCount);
            if (catCount > maxMatCatCount) {
                maxMatCatCount = catCount;
                maxMatCat = item1.name;
            }
        });
        return maxMatCat;
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
            VERB_2: /(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/i,
            NOUN: /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/i,
            DERIVATIONAL: /.*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$/i,
            DER: /ость?$/i,
            SUPERLATIVE: /(ейше|ейш)$/i,
            I: /и$/i,
            P: /ь$/i,
            NN: /нн$/i
        };
   
        word = word.replace(/ё/gi, 'e');
        var wParts = word.match(DICT.RVRE);
        if (!wParts) {
            return word;
        }
        var start = wParts[1];
        var rv = wParts[2];
        var temp = rv.replace(DICT.PERFECTIVEGROUND_2, '');
        if (temp == rv) {
            temp = rv.replace(DICT.PERFECTIVEGROUND_1, '$1');
        }
        if (temp == rv) {
            rv = rv.replace(DICT.REFLEXIVE, '');
            temp = rv.replace(DICT.ADJECTIVE, '');
            if (temp != rv) {
                rv = temp;
                temp = rv.replace(DICT.PARTICIPLE_2, '');
                if (temp == rv) {
                    rv = rv.replace(DICT.PARTICIPLE_1, '$1');
                }
            } else {
                temp = rv.replace(DICT.VERB_2, '');
                if (temp == rv) {
                    temp = rv.replace(DICT.VERB_1, '$1');
                }
                if (temp == rv) {
                    rv = rv.replace(DICT.NOUN, '');
                } else {
                    rv = temp;
                }
            }
        } else {
            rv = temp;
        }
        rv = rv.replace(DICT.I, '');
        if (rv.match(DICT.DERIVATIONAL)) {
            rv = rv.replace(DICT.DER, '');
        }
        temp = rv.replace(DICT.P, '');
        if (temp == rv) {
            rv = rv.replace(DICT.SUPERLATIVE, '');
            rv = rv.replace(DICT.NN, 'н');
        } else {
            rv = temp;
        }
        return start + rv;
    };

}