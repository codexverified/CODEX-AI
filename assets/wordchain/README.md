# Word Chain Dictionary

`words.txt` is the main word list bundled for the Word Chain game. It is
sourced from the MIT-licensed `word-list` package, which in turn identifies
the English word list at https://github.com/atebits/Words/blob/master/Words/en.txt.

`common-words.txt` adds single-word English names, animals, foods, and
geography terms. Both files are merged at startup. Idioms and phrases are not
included because the game accepts single alphabetic words only.

The game reads this file one word per line and filters entries to lowercase
ASCII words from 2 through 30 letters at startup.