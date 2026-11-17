// One definition of "the holidays" for every seasonal decoration (snow,
// garland, wreath), so they switch on and off together instead of each
// being hand-removed in January. November 1 through January 6 (Epiphany,
// when decorations traditionally come down).
export function isHolidaySeason(now: Date = new Date()): boolean {
  const month = now.getMonth(); // 0 = January
  const day = now.getDate();
  return month === 10 || month === 11 || (month === 0 && day <= 6);
}
