// The names. One hall, four seats.
//
//   Gandalf  the owner: walks in, sees through the counsel, has the final word
//   Théoden  Claude Code: the king who acts; his judgment must be kept clear
//   Gríma    the owner's ChatGPT: the counsel at the king's table, every word tested
//   Háma     the Watch: the Doorward of Meduseld, who decides who passes the door
//
// `human` is what people read (transcripts, frames, docs). `model` is what the
// counsel itself is told: it is never named Gríma, only described, so the model is
// never asked to play a traitor. The functional keys (captain, chief, navigator,
// watch) stay in the code and the event log; only the labels change.
export const THEME = {
  human: { captain: 'Gandalf', chief: 'Théoden', navigator: 'Gríma', watch: 'Háma' },
  model: { captain: 'Gandalf', chief: 'Théoden (Claude Code)', navigator: 'the Counsel', watch: 'Háma, the Doorward' },
  thread: 'council',
  hall: 'the Golden Hall',
  annals: 'the annals',
  tagline: 'The counsel is heard. The king rides. Gandalf has the last word.',
};

export const label = (author, who = 'human') =>
  ({ claude: THEME[who].chief, gpt: THEME[who].navigator, human: THEME[who].captain, watch: THEME[who].watch, system: 'System' })[author] || author;
