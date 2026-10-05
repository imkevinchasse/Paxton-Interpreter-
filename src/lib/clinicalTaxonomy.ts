/**
 * Clinical Speech & Language Pathology Taxonomy
 *
 * Grounded in empirical phonological processes and motor speech characteristics
 * commonly observed across childhood apraxia of speech (CAS), dysarthria (cerebral palsy),
 * Down syndrome (hypotonia, oral-motor constraints), autism spectrum (gestalt language,
 * prosodic/morphosyntactic idiosyncrasies), and developmental phonological delays.
 *
 * Rules focus on the clinical pattern and oral-motor / phonological "why", rather than
 * stigmatizing diagnostic labels.
 */

export interface ClinicalPatternDefinition {
  key: string;
  name: string;
  category: 'syllable_structure' | 'substitution' | 'assimilation' | 'morphosyntax' | 'coarticulation';
  categoryLabel: string;
  patternType: 'consonant_deletion' | 'intrusive_article' | 'vowel_reduction' | 'word_merging' | 'prefix_omission' | 'custom';
  description: string;
  clinicalReasoning: string;
  defaultAction: string;
  defaultCondition: string;
  confidence: number;
  triggerRegex: RegExp;
  expectRegex: RegExp;
  examples: { spoken: string; intended: string; note: string }[];
  applyTransform?: (text: string) => string;
}

export const CLINICAL_PATTERNS: ClinicalPatternDefinition[] = [
  // 1. Final Consonant Deletion (Coda Truncation)
  {
    key: 'coda_deletion',
    name: 'Final Alveolar Plosive /d, t/ Deletion (Coda Truncation)',
    category: 'syllable_structure',
    categoryLabel: 'Syllable Structure Process',
    patternType: 'consonant_deletion',
    description: 'Elision of word-final alveolar stops /d/ and /t/ in content verbs and nouns.',
    clinicalReasoning: 'Observed frequently in oral hypotonia and motor speech easing, where halting airflow at the alveolar ridge requires high oral-motor precision before a word boundary.',
    defaultAction: "Restore elided terminal stop ('nee' -> 'need', 'goo' -> 'good', 'hell' -> 'help')",
    defaultCondition: "Spoken token ending in open vowel ('nee', 'goo', 'hell') where syntax expects terminal consonant",
    confidence: 0.95,
    triggerRegex: /\b(nee|goo|gooh|hell)\b/i,
    expectRegex: /\b(need|good|help)\b/i,
    examples: [
      { spoken: 'i nee a hell', intended: 'I need some help', note: "'nee' -> 'need', 'hell' -> 'help'" },
      { spoken: 'gooh job', intended: 'good job', note: "'gooh' -> 'good'" }
    ],
    applyTransform: s => s.replace(/\bnee\b/gi, 'need').replace(/\bgoo(?:h)?\b/gi, 'good').replace(/\bhell\b/gi, 'help')
  },
  {
    key: 'coda_truncation_general',
    name: 'General Final Consonant Deletion (Open Syllable Bias)',
    category: 'syllable_structure',
    categoryLabel: 'Syllable Structure Process',
    patternType: 'consonant_deletion',
    description: 'Systematic truncation of syllable-final consonants in monosyllabic content words.',
    clinicalReasoning: 'Simplification toward an open CV (consonant-vowel) syllable template, very common in developmental phonological delay and childhood dysarthria.',
    defaultAction: "Restore missing terminal consonants in core content words ('foo' -> 'food', 'ha' -> 'have', 'wan' -> 'want')",
    defaultCondition: "Spoken open syllable ('foo', 'ha', 'wan') functioning as lexical head",
    confidence: 0.94,
    triggerRegex: /\b(foo|ha|wan)\b/i,
    expectRegex: /\b(food|have|want)\b/i,
    examples: [
      { spoken: 'iwa foo', intended: 'I want food', note: "'foo' -> 'food'" },
      { spoken: 'no ha lunsh', intended: "didn't have lunch", note: "'ha' -> 'have'" }
    ],
    applyTransform: s => s.replace(/\bfoo\b/gi, 'food').replace(/\bha\b/gi, 'have').replace(/\bwan\b/gi, 'want')
  },

  // 2. Cluster Reduction & Glottalization
  {
    key: 'cluster_reduction',
    name: 'Consonant Cluster Simplification (Onset & Medial Clusters)',
    category: 'syllable_structure',
    categoryLabel: 'Syllable Structure Process',
    patternType: 'consonant_deletion',
    description: 'Simplification of multi-consonant blends (/pl/, /sl/, /st/, /sp/) into single ease-of-articulation consonants.',
    clinicalReasoning: 'Co-articulatory complexity in consonant clusters demands rapid lingual transitions that exceed neuromuscular coordination limits in dyspraxia and motor speech delays.',
    defaultAction: "Reconstruct targeted consonant cluster ('pay' -> 'play', 'seep' -> 'sleep', 'tuck' -> 'stuck')",
    defaultCondition: "Single consonant substituting for target onset consonant cluster",
    confidence: 0.95,
    triggerRegex: /\b(pay|seep|tuck)\b/i,
    expectRegex: /\b(play|sleep|stuck)\b/i,
    examples: [
      { spoken: 'wan a pay', intended: 'want to play', note: "'pay' -> 'play'" },
      { spoken: 'go a seep', intended: 'go to sleep', note: "'seep' -> 'sleep'" }
    ],
    applyTransform: s => s.replace(/\bpay\b/gi, 'play').replace(/\bseep\b/gi, 'sleep').replace(/\btuck\b/gi, 'stuck')
  },
  {
    key: 'baman',
    name: 'Medial Cluster Glottalization in Compound Entities ("ba-man" -> "Batman")',
    category: 'syllable_structure',
    categoryLabel: 'Syllable Structure Process',
    patternType: 'word_merging',
    description: 'Replacement of medial unreleased plosives with a glottal pause/hyphenated juncture in proper compounds.',
    clinicalReasoning: 'Lingual arrest easing: replacing tongue-tip contact /t/ with vocal fold glottalization before a bilabial /m/ saves an articulatory repositioning cycle.',
    defaultAction: "Reconstruct compound character entity ('ba-man' -> 'Batman', 'spi-man' -> 'Spiderman')",
    defaultCondition: "Phonetic pattern 'ba-man' or similar superhero/character compound",
    confidence: 0.98,
    triggerRegex: /\b(ba-man|spi-man)\b/i,
    expectRegex: /\b(batman|spiderman|spider-man)\b/i,
    examples: [
      { spoken: 'ba-man movie', intended: 'Batman movie', note: "'ba-man' -> 'Batman'" }
    ],
    applyTransform: s => s.replace(/\bba-man\b/gi, 'Batman').replace(/\bspi-man\b/gi, 'Spiderman')
  },

  // 3. Substitution Processes: Stopping & Fronting
  {
    key: 'th_stopping',
    name: 'Interdental Fricative Stopping (/ð, θ/ -> /d, t/)',
    category: 'substitution',
    categoryLabel: 'Substitution Process',
    patternType: 'consonant_deletion',
    description: 'Systematic conversion of continuous interdental fricatives into complete alveolar stop closures ("dis", "dat").',
    clinicalReasoning: 'Frication requires sustained subglottic breath pressure and fine tongue-blade grooving. Stopping provides a complete motor seal requiring less continuous acoustic airflow control.',
    defaultAction: "Translate stopped demonstratives and pronouns ('dis' -> 'this', 'dat' -> 'that', 'dem' -> 'them')",
    defaultCondition: "Spoken token 'dis', 'dat', 'dem', 'dey' in demonstrative/pronominal position",
    confidence: 0.97,
    triggerRegex: /\b(dis|dat|dem|dey)\b/i,
    expectRegex: /\b(this|that|them|they)\b/i,
    examples: [
      { spoken: 'wa is dis', intended: 'what is this', note: "'dis' -> 'this'" },
      { spoken: 'i wike dat', intended: 'I like that', note: "'dat' -> 'that'" }
    ],
    applyTransform: s => s.replace(/\bwa\s+is\s+dis\b/gi, 'what is this').replace(/\bdis\b/gi, 'this').replace(/\bdat\b/gi, 'that').replace(/\bdem\b/gi, 'them').replace(/\bdey\b/gi, 'they')
  },
  {
    key: 'velar_fronting',
    name: 'Velar Stop Fronting (/k, g/ -> /t, d/)',
    category: 'substitution',
    categoryLabel: 'Substitution Process',
    patternType: 'consonant_deletion',
    description: 'Anterior tongue-tip elevation replacing posterior velar elevation for /k/ and /g/.',
    clinicalReasoning: 'The anterior tongue tip possesses superior somatosensory feedback and motor control compared to the posterior tongue dorsum elevated toward the soft palate.',
    defaultAction: "Restore intended velar plosive ('tat' -> 'cat', 'do' -> 'go', 'tookie' -> 'cookie')",
    defaultCondition: "Alveolar plosive occurring in place of target velar consonant",
    confidence: 0.92,
    triggerRegex: /\b(tat|do|tookie)\b/i,
    expectRegex: /\b(cat|go|cookie)\b/i,
    examples: [
      { spoken: 'tat run', intended: 'cat run', note: "'tat' -> 'cat'" },
      { spoken: 'do home', intended: 'go home', note: "'do' -> 'go'" }
    ],
    applyTransform: s => s.replace(/\btat\b/gi, 'cat').replace(/\bdo\b/gi, 'go').replace(/\btookie\b/gi, 'cookie')
  },

  // 4. Gliding of Liquids
  {
    key: 'liquid_gliding',
    name: 'Liquid Gliding (/l, r/ -> /w, j/)',
    category: 'substitution',
    categoryLabel: 'Substitution Process',
    patternType: 'consonant_deletion',
    description: 'Substitution of labiovelar or palatal glides /w, j/ for lateral liquid /l/ and rhotic /r/.',
    clinicalReasoning: 'Liquid consonants require subtle retroflexion or lateral tongue-blade rim curling with partial lateral acoustic airflow; glides only require gross lip rounding or high tongue posture.',
    defaultAction: "Restore lateral/rhotic liquid consonant ('wike' -> 'like', 'yeyo' -> 'yellow', 'wed' -> 'red')",
    defaultCondition: "Word-initial or medial glide /w/ or /j/ in lexical liquid targets",
    confidence: 0.94,
    triggerRegex: /\b(wike|yeyo|wed)\b/i,
    expectRegex: /\b(like|yellow|red)\b/i,
    examples: [
      { spoken: 'i wike dat', intended: 'I like that', note: "'wike' -> 'like'" },
      { spoken: 'yeyo car', intended: 'yellow car', note: "'yeyo' -> 'yellow'" }
    ],
    applyTransform: s => s.replace(/\bwike\b/gi, 'like').replace(/\byeyo\b/gi, 'yellow').replace(/\bwed\b/gi, 'red')
  },

  // 5. Deaffrication & Sibilant Easing
  {
    key: 'sibilant_deaffrication',
    name: 'Palatal Deaffrication & Sibilant Easing (/tʃ, dʒ/ -> /ʃ, s/)',
    category: 'substitution',
    categoryLabel: 'Substitution Process',
    patternType: 'consonant_deletion',
    description: 'Loss of stop portion in affricate consonants, producing a continuant fricative ("lunsh" -> "lunch", "shursh" -> "church").',
    clinicalReasoning: 'Affricates combine a full plosive closure followed immediately by controlled narrow fricative release. Deaffrication eliminates the two-stage articulatory movement.',
    defaultAction: "Restore postalveolar affricate ('lunsh' -> 'lunch', 'shursh' -> 'church', 'wosh' -> 'watch')",
    defaultCondition: "Spoken continuant 'sh' in syllable-final position of affricate nouns/verbs",
    confidence: 0.95,
    triggerRegex: /\b(lunsh|shursh|wosh)\b/i,
    expectRegex: /\b(lunch|church|watch)\b/i,
    examples: [
      { spoken: 'eat lunsh', intended: 'eat lunch', note: "'lunsh' -> 'lunch'" },
      { spoken: 'go to shursh', intended: 'go to church', note: "'shursh' -> 'church'" }
    ],
    applyTransform: s => s.replace(/\blunsh\b/gi, 'lunch').replace(/\bshursh\b/gi, 'church').replace(/\bwosh\b/gi, 'watch')
  },

  // 6. Intrusive Articles & Rhythmic Anchors
  {
    key: 'intrusive_a',
    name: 'Intrusive Indefinite Article "a" before Mass Nouns & Verbal Predicates',
    category: 'morphosyntax',
    categoryLabel: 'Rhythmic / Morphosyntactic Framing',
    patternType: 'intrusive_article',
    description: 'Insertion of unstressed schwa /ə/ ("a") as a metrical timing anchor before non-countable nouns or verbs.',
    clinicalReasoning: 'Rhythmic pacing anchor: In developmental apraxia and gestalt language acquisition, an unstressed schwa preserves syllabic timing rhythm across phrase transitions.',
    defaultAction: "Omit intrusive 'a' before mass nouns or translate as preposition 'to' / partitive 'some'",
    defaultCondition: "Spoken 'a' between modal/verb and uncountable noun or base verb ('a help', 'a sleep')",
    confidence: 0.96,
    triggerRegex: /\b(nee|need|wan|want|go)\s+a\s+(hell|help|sleep|play|eat)\b/i,
    expectRegex: /\b(need\s+(?:some\s+)?help|want\s+to\s+play|go\s+to\s+sleep)\b/i,
    examples: [
      { spoken: 'i nee a hell', intended: 'I need some help', note: "Resolves 'a hell' -> 'some help'" },
      { spoken: 'he go a sleep', intended: 'he goes to sleep', note: "Resolves 'go a sleep' -> 'goes to sleep'" }
    ],
    applyTransform: s => s
      .replace(/\b(nee|need)\s+a\s+(?:hell|help)\b/gi, 'need some help')
      .replace(/\b(wan|want)\s+a\s+(?:hell|help)\b/gi, 'want some help')
      .replace(/\b(wan|want)\s+a\s+play\b/gi, 'want to play')
      .replace(/\b(go)\s+a\s+sleep\b/gi, 'go to sleep')
      .replace(/\ba\s+hell\b/gi, 'some help')
  },

  // 7. Morphosyntactic Omission: Zero Copula Syntax
  {
    key: 'copula_omission',
    name: 'Zero Copula Ellipsis in Predicative Adjectives ("I hunry" -> "I am hungry")',
    category: 'morphosyntax',
    categoryLabel: 'Morphosyntactic Structure',
    patternType: 'grammar_syntax' as any,
    description: 'Omission of inflected forms of auxiliary/copular verb "to be" between subject and adjective/participle.',
    clinicalReasoning: 'Telegraphic speech preservation: low-information-density functional copulas are omitted to allocate cognitive and motor energy to high-salience content words.',
    defaultAction: "Insert inflected present-tense copula ('I am' or \"I'm\")",
    defaultCondition: "Subject pronoun 'I' directly preceding predicate state adjective ('hunry', 'tired', 'happy')",
    confidence: 0.93,
    triggerRegex: /\bi\s+(hunry|hungry|tired|tire|happy|sad|sick)\b/i,
    expectRegex: /\b(i am|i'm)\s+(hungry|tired|happy|sad|sick)\b/i,
    examples: [
      { spoken: 'I hunry', intended: 'I am hungry', note: "Copula insertion: 'I hunry' -> 'I am hungry'" },
      { spoken: 'I tired', intended: 'I am tired', note: "Copula insertion: 'I tired' -> 'I am tired'" }
    ],
    applyTransform: s => s.replace(/\bi\s+hunry\b/gi, 'I am hungry').replace(/\bi\s+tired\b/gi, 'I am tired').replace(/\bi\s+happy\b/gi, 'I am happy')
  },

  // 8. Negative Auxiliary Reduction & Substitution
  {
    key: 'neg_auxiliary_reduction',
    name: 'Preverbal Negative Particle Substitution ("no ha" -> "didn\'t have / don\'t have")',
    category: 'morphosyntax',
    categoryLabel: 'Morphosyntactic Structure',
    patternType: 'word_merging',
    description: 'Use of invariant negation particle "no" directly before base verbs rather than inflected do-auxiliaries.',
    clinicalReasoning: 'Developmental syntactic framing: early language acquisition often uses preverbal "no + Verb" prior to mastering auxiliary do-support and tense inflection.',
    defaultAction: "Translate as standard inflected negative auxiliary ('no ha' -> \"didn't have\" or \"don't have\")",
    defaultCondition: "Negative particle 'no' preceding base verb ('no ha', 'no wan')",
    confidence: 0.92,
    triggerRegex: /\bno\s+(ha|have|wan|want)\b/i,
    expectRegex: /\b(didn't have|don't have|don't want|no food)\b/i,
    examples: [
      { spoken: 'no ha lunsh', intended: "didn't have lunch", note: "'no ha' -> \"didn't have\"" },
      { spoken: 'no wan dat', intended: "don't want that", note: "'no wan' -> \"don't want\"" }
    ],
    applyTransform: s => s.replace(/\bno\s+ha\b/gi, "didn't have").replace(/\bno\s+wan\b/gi, "don't want")
  },
  {
    key: 'dussin',
    name: 'Negative Auxiliary Contraction Reduction ("dussin" -> "doesn\'t")',
    category: 'morphosyntax',
    categoryLabel: 'Morphosyntactic Structure',
    patternType: 'word_merging',
    description: 'Articulatory assimilation and coronal coda deletion in 3rd-person negative auxiliary.',
    clinicalReasoning: 'Complex tri-consonantal contraction /znt/ undergoes central vowel laxing and stop deletion, yielding dissyllabic easing [dʌsɪn].',
    defaultAction: "Translate as 3rd person negative auxiliary 'doesn't'",
    defaultCondition: "Spoken token 'dussin' preceding a lexical verb",
    confidence: 0.95,
    triggerRegex: /\bdussin\b/i,
    expectRegex: /\b(doesn't|does not)\b/i,
    examples: [
      { spoken: 'dussin work', intended: "doesn't work", note: "'dussin' -> \"doesn't\"" }
    ],
    applyTransform: s => s.replace(/\bdussin\b/gi, "doesn't")
  },

  // 9. Weak Syllable Deletion
  {
    key: 'weak_syllable_deletion',
    name: 'Unstressed Syllable / Prefix Deletion ("plane" -> "airplane", "member" -> "remember")',
    category: 'syllable_structure',
    categoryLabel: 'Syllable Structure Process',
    patternType: 'prefix_omission',
    description: 'Omission of unstressed initial syllables or affixes preceding primary trochaic stress.',
    clinicalReasoning: 'Acoustic salience filtering: unstressed initial syllables possess lower perceptual energy and are dropped in favor of the stressed root syllable.',
    defaultAction: "Restore elided unstressed initial syllable or prefix",
    defaultCondition: "Isolated root syllable occurring in context where compound or prefixed form is intended",
    confidence: 0.91,
    triggerRegex: /\b(plane|tato|member)\b/i,
    expectRegex: /\b(airplane|potato|remember)\b/i,
    examples: [
      { spoken: 'see da airplane', intended: 'see the airplane', note: "Maintains syllable boundary" }
    ],
    applyTransform: s => s.replace(/\bda\s+airplane\b/gi, 'the airplane')
  },

  // 10. Labial Assimilation / Consonant Harmony
  {
    key: 'labial_assimilation',
    name: 'Labial Consonant Assimilation & Harmony (/θ/ -> /f/ as in "mouf" -> "mouth")',
    category: 'assimilation',
    categoryLabel: 'Articulatory Assimilation',
    patternType: 'consonant_deletion',
    description: 'Consonant shifts toward labial or labiodental place of articulation across vowels.',
    clinicalReasoning: 'Place-harmony easing: interdental consonants adopt labiodental contact when adjacent to bilabials or round vowels, reducing required intraoral adjustments.',
    defaultAction: "Restore canonical interdental target ('mouf' -> 'mouth', 'wit' -> 'with')",
    defaultCondition: "Labiodental fricative /f/ terminating word with target interdental /θ/",
    confidence: 0.92,
    triggerRegex: /\b(mouf|wit)\b/i,
    expectRegex: /\b(mouth|with)\b/i,
    examples: [
      { spoken: 'open mouf', intended: 'open mouth', note: "'mouf' -> 'mouth'" }
    ],
    applyTransform: s => s.replace(/\bmouf\b/gi, 'mouth').replace(/\bwit\b/gi, 'with')
  }
];

export const CLINICAL_CATEGORY_LABELS: Record<string, string> = {
  all: 'All Processes',
  syllable_structure: 'Syllable Structure (Coda / Clusters)',
  substitution: 'Substitutions (Stopping / Gliding / Fronting)',
  morphosyntax: 'Morphosyntax (Articles / Copulas / Negation)',
  assimilation: 'Articulatory Assimilation',
  custom: 'Individually Mined Patterns'
};
