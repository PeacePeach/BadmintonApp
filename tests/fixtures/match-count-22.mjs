// 22 saved matches, only 16 with a confirmed outcome (8 won, 8 lost), like Han's Matches page on 2026-10-26
// ("22 matches logged", Total Matches 16, 8–8 W–L). The 6 undecided ones cover each way a result can be missing.
// App shape (fromMatchRow): games are [us, them] or { r } / { r, u: 1 } with no score.
const day = i => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
const M = (i, x) => ({ id: 'm' + i, date: day(i), createdAt: day(i) + 'T12:00:00.000Z', type: 'Singles', partner: null, opps: ['alex'], games: [[21, 17], [21, 18]], wt: [], lt: [], worked: '', lost: '', on: '', ...x });
const W = [[21, 17], [21, 18]], L = [[17, 21], [18, 21]];
export const players = [{ id: 'me', name: 'Han', level: null }, { id: 'alex', name: 'Alex' }, { id: 'leo', name: 'Leo' }, { id: 'mei', name: 'Mei' }, { id: 'kai', name: 'Kai' }];
export const decided = [
  M(0, { games: W }), M(1, { games: L }), M(2, { games: W, opps: ['leo'] }), M(3, { games: L, opps: ['leo'] }),
  M(4, { games: [{ r: 'W' }, { r: 'W' }] }),                                   // won, scores not recorded
  M(5, { games: [{ r: 'L' }, { r: 'W' }, { r: 'L' }] }),                       // lost, scores not recorded
  M(6, { games: [{ r: 'W', u: 1 }, { r: 'W', u: 1 }, { r: 'L', u: 1 }] }),     // won, order not known
  M(7, { games: L, opps: [] }),                                                 // lost, opponent not set
  M(8, { type: 'Doubles', partner: 'kai', opps: ['mei', 'leo'], games: W }),
  M(9, { type: 'Doubles', partner: 'kai', opps: ['mei', 'leo'], games: L }),
  M(10, { type: 'Doubles', partner: null, opps: ['mei'], games: [[21, 19], [17, 21], [21, 15]] }), // won, partner and one opponent missing
  M(11, { type: 'Doubles', partner: 'kai', opps: ['mei', 'leo'], games: [[19, 21], [21, 17], [18, 21]] }),
  M(12, { games: [[21, 10]] }), M(13, { games: [[10, 21]] }),
  M(14, { type: 'Doubles', partner: 'kai', opps: ['mei', 'alex'], games: W }), M(15, { games: L, opps: ['leo'] })
];
export const undecided = [
  M(16, { games: [{ r: 'W' }, { r: 'L' }] }),                                   // level 1–1, voice, no scores
  M(17, { games: [[21, 15], [15, 21]], opps: ['leo'] }),                        // level 1–1 with scores
  M(18, { games: [] }),                                                         // no game result saved
  M(19, { games: [{ r: 'W', u: 1 }, { r: 'L', u: 1 }] }),                       // level, order not known
  M(20, { type: 'Doubles', partner: null, opps: [], games: [{ r: 'L' }, { r: 'W' }] }), // level, players missing
  M(21, { type: 'Doubles', partner: 'kai', opps: ['mei', 'leo'], games: [] })   // doubles, no result
];
// Newest first, like the app's load().
export const matches = [...decided, ...undecided].sort((a, b) => a.date < b.date ? 1 : -1);
