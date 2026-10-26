// A record set shaped like Han's account as he verified it in Supabase on 2026-10-26: 17 matches, 12 with Skill
// Tags, 9 with opponent notes, 5 doubles. The notes reuse Han's own Chinese notes (from the v10/v11 fixtures);
// opponents and order are a reconstruction, since the rows themselves aren't readable from here.
const day = i => new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10);
const W = [[21, 17], [21, 18]], L = [[17, 21], [18, 21]], W3 = [[21, 18], [19, 21], [21, 16]], L3 = [[18, 21], [21, 19], [16, 21]];
const M = (i, x) => ({ id: 'm' + i, date: day(i), created_at: day(i) + 'T12:00:00Z', type: 'Singles', partner: null, opps: [], games: W, wt: [], lt: [], worked: '', lost: '', opp_notes: '', ...x });
export const players = [{ id: 'me', name: 'Han' }, { id: 'alex', name: 'Alex' }, { id: 'leo', name: 'Leo' }, { id: 'mei', name: 'Mei' }, { id: 'ravi', name: 'Ravi' }, { id: 'kai', name: 'Kai' }, { id: 'jo', name: 'Jo' }];
export const matches = [
  M(0, { opps: ['alex'], games: L }),
  M(1, { opps: ['leo'], games: W, opp_notes: 'Leo 反手比较弱' }),
  M(2, { type: 'Doubles', partner: 'kai', opps: ['mei', 'ravi'], games: W3 }),
  M(3, { opps: ['alex'], games: L, lt: ['Defence'], lost: '反手防守比较弱', opp_notes: 'Alex 一直压我反手' }),
  M(4, { opps: ['jo'], games: W }),
  M(5, { opps: ['leo'], games: W, wt: ['Net'], worked: '网前搓球很稳', opp_notes: 'Leo 网前不太积极' }),
  M(6, { type: 'Doubles', partner: 'kai', opps: ['mei', 'ravi'], games: L, lt: ['Defence'], lost: '平抽挡的时候站位太靠后', opp_notes: 'Mei 杀球很重' }),
  M(7, { opps: ['alex'], games: W, wt: ['Smash'], worked: '杀球靠边线效果很好', lt: ['Net'] }),
  M(8, { opps: ['jo'], games: W, wt: ['Smash'], lt: ['Net'] }),
  M(9, { opps: ['alex'], games: L, lt: ['Smash'], lost: '后场杀球失误比较多', opp_notes: 'Alex 接杀很稳，喜欢挡网前' }),
  M(10, { type: 'Doubles', partner: 'kai', opps: ['mei', 'ravi'], games: W3, wt: ['Serve'], worked: '发小球质量不错' }),
  M(11, { opps: ['leo'], games: L, lt: ['Return'], wt: ['Serve'], lost: '接发比较被动', opp_notes: 'Leo 发球变化多' }),
  M(12, { opps: ['alex'], games: L, lt: ['Smash', 'Defence'], lost: '杀球太多。反手防守比较弱。', opp_notes: 'Alex 打我反手底线' }),
  M(13, { type: 'Doubles', partner: 'kai', opps: ['mei', 'jo'], games: L3, opp_notes: 'Jo 网前封得很快' }),
  M(14, { opps: ['ravi'], games: L, lt: ['Placement'], lost: '网前吊球不好' }),
  M(15, { type: 'Doubles', partner: 'kai', opps: ['mei', 'ravi'], games: W, wt: ['Net'], worked: '前场封网有效', opp_notes: 'Ravi 后场进攻多' }),
  M(16, { opps: ['leo'], games: W, wt: ['Footwork'], worked: '步法比较到位' })
];
// Newest first, like the edge function's query.
export const rows = () => [...matches].reverse();
export const summary = () => ({ total: matches.length, tagged: matches.filter(m => m.wt.length || m.lt.length).length, oppNotes: matches.filter(m => m.opp_notes).length, doubles: matches.filter(m => m.type === 'Doubles').length });
