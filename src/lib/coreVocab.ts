/**
 * Everyday words a child is likely to say, most useful first.
 *
 * The offline sound-alike guesser (phonetic.ts) can only suggest words it knows. Order matters: earlier words get a
 * small bonus when two words sound equally close ("mom" before "man", "food" before "foot"). Paxton's own dictionary
 * and verified meanings are added on top of this list at runtime, so the list only needs to cover ordinary speech.
 */
export const CORE_VOCAB: string[] = [
  // people and self
  'i', 'me', 'my', 'mom', 'dad', 'you', 'we', 'he', 'she', 'it', 'they', 'baby', 'brother', 'sister', 'friend',
  'grandma', 'grandpa', 'teacher', 'doctor', 'boy', 'girl', 'man', 'people',
  // most common verbs and helpers
  'want', 'have', 'need', 'go', 'do', 'is', 'am', 'are', 'was', 'like', 'see', 'get', 'eat', 'drink', 'play', 'help',
  'look', 'come', 'give', 'make', 'put', 'open', 'close', 'stop', 'wait', 'watch', 'read', 'sit', 'stand', 'walk',
  'run', 'jump', 'sleep', 'wash', 'brush', 'clean', 'take', 'turn', 'try', 'know', 'think', 'love', 'hug', 'hurt',
  'feel', 'say', 'tell', 'ask', 'sing', 'draw', 'build', 'throw', 'catch', 'push', 'pull', 'hold', 'carry', 'find',
  'lose', 'wear', 'bring', 'show', 'share', 'cry', 'laugh', 'hide', 'fall', 'break', 'fix', 'cut', 'cook', 'bake',
  'ride', 'swim', 'dance', 'climb', 'kick', 'hit', 'pick', 'dig', 'pour', 'wipe', 'listen', 'talk', 'call', 'move',
  // function words
  'a', 'the', 'to', 'and', 'in', 'on', 'at', 'up', 'down', 'out', 'off', 'with', 'for', 'of', 'no', 'not', 'yes',
  'please', 'thank', 'sorry', 'okay', 'what', 'where', 'who', 'why', 'how', 'when', 'this', 'that', 'there', 'here',
  'some', 'more', 'all', 'one', 'two', 'three', 'four', 'five', 'again', 'now', 'later', 'too', 'very', 'so', 'but',
  'because', 'if', 'then', 'or', 'can', 'will', 'did', 'does', "don't", "didn't", "doesn't", "can't", "won't", "i'm",
  'has', 'had', 'be', 'been', 'been', 'would', 'could', 'should', 'let', 'us', 'them', 'him', 'her', 'his', 'your',
  'our', 'their', 'its', 'these', 'those', 'any', 'each', 'other', 'another', 'just', 'only', 'also', 'still', 'even',
  'away', 'back', 'over', 'under', 'inside', 'outside', 'around', 'home', 'from', 'into', 'about', 'after', 'before',
  // food and drink
  'food', 'water', 'milk', 'juice', 'lunch', 'dinner', 'breakfast', 'snack', 'cookie', 'cracker', 'apple', 'banana',
  'grapes', 'orange', 'bread', 'butter', 'cheese', 'egg', 'eggs', 'pizza', 'chicken', 'rice', 'pasta', 'noodles',
  'soup', 'cereal', 'toast', 'candy', 'chocolate', 'ice', 'cream', 'cake', 'cupcake', 'pie', 'fries', 'burger',
  'hot', 'dog', 'sandwich', 'yogurt', 'fruit', 'vegetables', 'carrot', 'corn', 'peas', 'beans', 'potato', 'tomato',
  'popcorn', 'cup', 'plate', 'bowl', 'spoon', 'fork', 'knife', 'bottle', 'straw', 'napkin', 'table', 'chair',
  'hungry', 'thirsty', 'full', 'yummy', 'delicious', 'taste',
  // feelings and states
  'good', 'bad', 'happy', 'sad', 'mad', 'angry', 'tired', 'sleepy', 'sick', 'scared', 'hurt', 'silly', 'funny',
  'nice', 'fun', 'cold', 'warm', 'wet', 'dry', 'dirty', 'clean', 'loud', 'quiet', 'fast', 'slow', 'big', 'little',
  'small', 'long', 'short', 'tall', 'new', 'old', 'pretty', 'ready', 'done', 'finished', 'best', 'favorite', 'bored',
  'excited', 'proud', 'lonely', 'hot', 'sore',
  // colours
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'brown', 'gray',
  // things and places
  'book', 'books', 'ball', 'toy', 'toys', 'car', 'truck', 'bus', 'train', 'plane', 'boat', 'bike', 'bed', 'door',
  'window', 'house', 'room', 'bathroom', 'kitchen', 'school', 'park', 'store', 'church', 'outside', 'yard', 'garden',
  'tv', 'movie', 'show', 'phone', 'tablet', 'computer', 'game', 'games', 'music', 'song', 'story', 'picture',
  'paper', 'pencil', 'crayon', 'color', 'paint', 'blocks', 'puzzle', 'doll', 'bear', 'blanket', 'pillow', 'shoes',
  'shoe', 'socks', 'sock', 'shirt', 'pants', 'coat', 'jacket', 'hat', 'gloves', 'pajamas', 'diaper', 'underwear',
  'bath', 'soap', 'towel', 'toothbrush', 'teeth', 'hair', 'face', 'hand', 'hands', 'foot', 'feet', 'head', 'tummy',
  'arm', 'leg', 'nose', 'mouth', 'eye', 'eyes', 'ear', 'ears', 'belly', 'back', 'finger', 'knee',
  'dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'pig', 'duck', 'bunny', 'monster', 'dinosaur', 'tiger', 'lion',
  'elephant', 'monkey', 'frog', 'bug', 'butterfly', 'bee', 'spider',
  'sun', 'moon', 'star', 'sky', 'rain', 'snow', 'wind', 'tree', 'flower', 'grass', 'rock', 'sand', 'beach', 'pool',
  'swing', 'slide', 'bubbles', 'balloon', 'present', 'birthday', 'party', 'cake', 'day', 'night', 'morning', 'today',
  'tomorrow', 'yesterday', 'time', 'bye', 'hi', 'hello', 'goodbye', 'goodnight', 'wow', 'oh', 'uh', 'me',
  'thing', 'something', 'nothing', 'everything', 'more', 'mine', 'yours', 'bigger', 'lots', 'many', 'much',
  'batman', 'spiderman', 'superman', 'mario', 'elmo'
].filter((w, i, all) => all.indexOf(w) === i);

/**
 * Word pairs that are very common in short requests. They only break ties between equally plausible sounds
 * ("I want" beats "I was" when the next word is "food"); they never override what the dictionary or rulebook says.
 */
export const CORE_BIGRAMS: [string, string][] = [
  ['i', 'want'], ['i', 'need'], ['i', 'have'], ['i', 'like'], ['i', 'love'], ['i', 'am'], ['i', 'see'], ['i', 'go'],
  ['i', 'can'], ['i', 'do'], ['i', 'will'], ['i', "don't"], ['i', "didn't"], ['i', "can't"], ['i', 'hurt'],
  ['you', 'are'], ['you', 'have'], ['we', 'go'], ['we', 'are'], ['he', 'is'], ['she', 'is'], ['it', 'is'],
  ['want', 'food'], ['want', 'water'], ['want', 'juice'], ['want', 'milk'], ['want', 'more'], ['want', 'to'],
  ['want', 'that'], ['want', 'this'], ['want', 'a'], ['want', 'my'], ['want', 'mom'], ['want', 'dad'],
  ['need', 'help'], ['need', 'to'], ['need', 'a'], ['need', 'water'], ['need', 'mom'], ['need', 'dad'],
  ['have', 'lunch'], ['have', 'dinner'], ['have', 'breakfast'], ['have', 'a'], ['have', 'some'], ['have', 'to'],
  ['no', 'have'], ['no', 'want'], ['no', 'more'], ['no', 'thank'], ['didn\'t', 'have'], ['don\'t', 'have'],
  ['don\'t', 'want'], ['don\'t', 'like'], ['don\'t', 'know'], ['am', 'hungry'], ['am', 'tired'], ['am', 'thirsty'],
  ['am', 'sleepy'], ['am', 'sick'], ['am', 'sad'], ['am', 'happy'], ['is', 'a'], ['is', 'good'], ['is', 'nice'],
  ['is', 'my'], ['is', 'hot'], ['is', 'cold'], ['is', 'big'], ['is', 'this'], ['is', 'that'], ['do', 'good'],
  ['do', 'it'], ['do', 'you'], ['go', 'to'], ['go', 'home'], ['go', 'outside'], ['go', 'away'], ['go', 'play'],
  ['go', 'park'], ['go', 'bed'], ['go', 'school'], ['go', 'store'], ['what', 'is'], ['what', 'that'], ['where', 'is'],
  ['where', 'mom'], ['where', 'dad'], ['thank', 'you'], ['all', 'done'], ['all', 'gone'], ['good', 'morning'],
  ['good', 'night'], ['good', 'job'], ['very', 'good'], ['so', 'good'], ['nice', 'book'], ['green', 'book'],
  ['read', 'book'], ['read', 'a'], ['read', 'my'], ['play', 'with'], ['play', 'ball'], ['play', 'game'],
  ['watch', 'tv'], ['watch', 'movie'], ['look', 'at'], ['come', 'here'], ['come', 'on'], ['ice', 'cream'],
  ['hot', 'dog'], ['french', 'fries'], ['more', 'please'], ['help', 'please'], ['please', 'help'], ['me', 'too'],
  ['my', 'turn'], ['my', 'mom'], ['my', 'dad'], ['a', 'cookie'], ['a', 'book'], ['a', 'ball'], ['a', 'nice'],
  ['the', 'book'], ['the', 'ball'], ['the', 'dog'], ['mom', 'do'], ['mom', 'is'], ['mom', 'come'], ['dad', 'come'],
  ['dad', 'is'], ['mom', 'help'], ['dad', 'help']
];
