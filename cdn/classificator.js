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

    loadKeyWordDatabaseLocal(database) {
        this.keyWordDatabase = database
    }

    loadKeyWordDatabase() {
        var db = this.keyWordDatabase
        var data = this.loadDb()
        data.forEach(function (item1) {

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
                    if (item3.name === item1.name) wordExist = true
                })
                if (!wordExist) {
                    // Нет слова в категории
                    var item = {}
                    item.name = item1.word
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
        this.keyWordDatabase.forEach(function (item1) {
            item1.dic.forEach(function (item2) {
                self.addWord(item1.name, item2.name, item2.weight)
            })
        })
    }

    // Добавление или замена слова в БД
    addWord(cat, word, weight) {
        // Проверяем, есть ли такое слово. Если есть, то PUT, если нет - POST
        var db = this.loadDb()
        var id = -1
        db.forEach(function (item) {
            if (item.category === cat && item.word === word) id = item.id
        })
        if (id === -1) {
            // Нет слова - POST
            $.ajax({
                url: ROOT + '/keywords/',
                method: 'POST',
                data: { category: cat, word: word, weight: weight },
                async: false
            })
        } else {
            // Такое слово есть - PUT
            $.ajax({
                url: ROOT + '/keywords/' + id,
                method: 'PUT',
                data: { category: cat, word: word, weight: weight },
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
            var catCount = 0
            item1.dic.forEach(function (item2) {
                words.forEach(function (item3) {
                    if (item3.name === item2.name) {
                        catCount += item3.count * item2.weight
                    }
                })
            })

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

        categoryPoints.forEach(function (item) {
            console.log(item.name + ' = ' + item.points.toFixed(1) + ' очков')
        })

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
            item1.dic.forEach(function (item2) {
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
        if (exist !== -1) {
            words.forEach(function (item1) {
                var existWord = -1
                var count = 0
                db[exist].dic.forEach(function (item2) {
                    if (item1.name === item2.name) existWord = count
                    count++
                })
                if (existWord !== -1) {
                    db[exist].dic[existWord].weight = Number(
                        ((db[exist].dic[existWord].weight + item1.count / max) / 2).toFixed(1)
                    )
                } else {
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
