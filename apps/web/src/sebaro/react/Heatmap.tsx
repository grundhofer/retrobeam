import { useRef, useState, type KeyboardEvent } from "react";

export type HeatDay = {
  /** the class of the value: seq-1 … seq-4, or none for a day without one */
  level: string;
  /** the day and its value as a sentence */
  sentence: string;
  today?: boolean;
};
type Props = {
  labelledBy: string;
  heads: string[];
  /** the weeks with their row head; null is a day still to come */
  weeks: ReadonlyArray<{ head: string; days: ReadonlyArray<HeatDay | null> }>;
  /** what the read-out says while no day is focused or pointed at */
  hint: string;
};

/** A heatmap as a grid with one tab stop: the arrows move by a day or a week, Home and End to the ends of the week
 *  (with Ctrl of all); days still to come are skipped. The focused or pointed day stands as a sentence under it. */
export function Heatmap({ labelledBy, heads, weeks, hint }: Props) {
  const days = weeks.flatMap((week, row) => week.days.flatMap((day, col) => (day ? [{ day, row, col }] : [])));
  // the tab stop: today, else the last day with a value
  const [stop, setStop] = useState(() => {
    const today = days.findIndex(({ day }) => day.today);
    return today < 0 ? days.length - 1 : today;
  });
  const [focused, setFocused] = useState<HeatDay | null>(null);
  const [pointed, setPointed] = useState<HeatDay | null>(null);
  const table = useRef<HTMLTableElement>(null);

  const onKeyDown = (event: KeyboardEvent, at: number) => {
    if (event.altKey || event.metaKey) return;
    const here = days[at];
    if (!here) return;
    const week = days.filter(({ row }) => row === here.row);
    const sameDay = days.filter(({ col }) => col === here.col);
    const moves: Record<string, (typeof days)[number] | undefined> = event.ctrlKey
      ? { Home: days[0], End: days[days.length - 1] }
      : {
          ArrowRight: days[at + 1],
          ArrowLeft: days[at - 1],
          ArrowDown: sameDay[sameDay.indexOf(here) + 1],
          ArrowUp: sameDay[sameDay.indexOf(here) - 1],
          Home: week[0],
          End: week[week.length - 1],
        };
    if (!(event.key in moves)) return;
    event.preventDefault(); // the grid keeps the arrow keys at its edges too: the page does not scroll
    const to = moves[event.key];
    if (to) table.current?.querySelectorAll<HTMLElement>("td[tabindex]")[days.indexOf(to)]?.focus();
  };

  return (
    <>
      <table ref={table} className="sb-heatmap" role="grid" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <td />
            {heads.map((head) => (
              <th key={head} scope="col">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody onPointerLeave={() => setPointed(null)}>
          {weeks.map((week, row) => (
            <tr key={week.head}>
              <th scope="row">{week.head}</th>
              {week.days.map((day, col) => {
                const at = days.findIndex((d) => d.row === row && d.col === col);
                if (!day) return <td key={heads[col]} />;
                return (
                  <td
                    key={heads[col]}
                    tabIndex={at === stop ? 0 : -1}
                    aria-current={day.today ? "date" : undefined}
                    onFocus={() => {
                      setStop(at);
                      setFocused(day);
                    }}
                    onBlur={() => setFocused(null)}
                    onPointerEnter={() => setPointed(day)}
                    onKeyDown={(event) => onKeyDown(event, at)}
                  >
                    <span className={`sb-scale-cell sb-scale-cell--${day.level}`} />
                    <span className="sb-visually-hidden">{day.sentence}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sb-chart__readout" aria-hidden="true">
        {(pointed ?? focused)?.sentence ?? hint}
      </p>
    </>
  );
}
