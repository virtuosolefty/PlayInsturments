/**
 * AppModals — extracted from App.jsx
 *
 * Manages all overlay dialogs: first-run welcome, dev tuning panel, error toast.
 */

import { memo } from 'react';
import FirstRun from './FirstRun.jsx';
import TuningPanel from './TuningPanel.jsx';

const AppModals = memo(function AppModals({
  showFirstRun,
  onFirstRunDone,
  onBeginner,
  practiceInstrument,
  onInstrumentChange,
  onSetup,
  midiState,
  profile,
  keyWindow,
  onConnectMidi,
  isDev,
  error,
  onErrorClose,
}) {
  return (
    <>
      {showFirstRun && (
        <FirstRun
          onBeginner={onBeginner}
          practiceInstrument={practiceInstrument}
          onInstrumentChange={onInstrumentChange}
          onSetup={onSetup}
          midiState={midiState}
          profile={profile}
          window={keyWindow}
          onConnectMidi={onConnectMidi}
          onDone={onFirstRunDone}
        />
      )}

      {isDev && <TuningPanel />}

      {error && (
        <div className="toast" role="alert" onClick={onErrorClose}>
          {error}
        </div>
      )}
    </>
  );
});

export default AppModals;
