import Icon from './Icon.jsx';
import StreakStrip from './StreakStrip.jsx';
import BackupPanel from './BackupPanel.jsx';

/**
 * The practice habit, plus everything you have earned a rating on.
 *
 * The streak alone would be a tab with one widget in it; the rated-pieces list
 * is what makes this worth opening, and it turns a flat library into a record
 * of where you have actually got to.
 */
export default function ProgressTab({ days, goalMinutes, onGoalChange, library, starsBySong, onPick, onRestored, onBeginner }) {
  const rated = library
    .map((song) => ({ song, stars: starsBySong[song.id] ?? 0 }))
    .filter((entry) => entry.stars > 0)
    .sort((a, b) => b.stars - a.stars || a.song.title.localeCompare(b.song.title));

  const mastered = rated.filter((r) => r.stars >= 4).length;

  return (
    <>
      <StreakStrip days={days} goalMinutes={goalMinutes} onGoalChange={onGoalChange} />

      <div className="section">
        <h2 className="section-title">
          Rated pieces
          {rated.length > 0 && <span className="tally">{mastered} mastered</span>}
        </h2>

        {rated.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Icon name="sparkle" size={18} /></span>
            <strong>Your first stars are one run away</strong>
            <p>
              Play a piece all the way through and it appears here with the stars you earned. A run that stops
              early is not rated, so the list only ever fills with finished work.
            </p>
            {onBeginner ? <button className="primary" onClick={onBeginner}>Start with a guided lesson</button> : library[0] && <button className="primary" onClick={() => onPick(library[0])}>Start with {library[0].title}</button>}
          </div>
        ) : (
          <div className="rated-list">
            {rated.map(({ song, stars }) => (
              <button key={song.id} className="rated" onClick={() => onPick(song)}>
                <span className="name">{song.title}</span>
                <span className="rated-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= stars ? 'on' : ''}>
                      <Icon name="starFill" size={12} />
                    </i>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <BackupPanel onRestored={onRestored} />
    </>
  );
}
