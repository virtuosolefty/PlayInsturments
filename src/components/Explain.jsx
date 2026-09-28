/**
 * Documentation on demand.
 *
 * The keyboard panel carried 291 words of prose against its 79 controls —
 * four full paragraphs about VST hosting, sample naming, octave following and
 * latency, all true, all useful, all at full volume permanently. Explanation
 * that never turns off stops being read at about the third session, and the
 * controls it surrounds never get any room.
 *
 * Same `<details>` mechanism as the folded library sections, so there is one
 * disclosure idiom in the app rather than two.
 */
export default function Explain({ label = 'How this works', children }) {
  return (
    <details className="explain">
      <summary>{label}</summary>
      <div className="explain-body">{children}</div>
    </details>
  );
}
