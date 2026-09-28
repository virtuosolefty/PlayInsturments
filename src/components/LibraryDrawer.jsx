/**
 * LibraryDrawer — extracted from App.jsx
 *
 * Manages the left sidebar with song library, path, progress, and keyboard setup tabs.
 * Cleaner separation of concerns from main App component.
 */

import { memo } from 'react';
import SongLibrary from './SongLibrary.jsx';
import Drawer from './Drawer.jsx';
import ProgressTab from './ProgressTab.jsx';
import PathTab from './PathTab.jsx';
import KeyboardPanel from './KeyboardPanel.jsx';

const LibraryDrawer = memo(function LibraryDrawer({
  libraryOpen,
  onToggleLibrary,
  library,
  localScores,
  activeScore,
  onPickSong,
  onLoadFile,
  keyWindow,
  starsBySong,
  starRates,
  suggestedId,
  onListen,
  days,
  goalMinutes,
  onGoalChange,
  path,
  onRestored,
  deviceName,
  profile,
  profileId,
  onProfileChange,
  onShiftOctave,
  onResetOctave,
  autoDetected,
  fit,
  onFitChange,
  assessment,
  latencyMs,
  onCalibrate,
  velocityCurve,
  onCalibrateTouch,
  instrumentSource,
  onInstrumentSourceChange,
  outputs,
  selectedOutputId,
  onSelectOutput,
  forwardInput,
  onForwardInputChange,
  onLoadSamples,
  pieceRange,
  onMoveWindow,
}) {
  return (
    <aside
      className="pane left"
      aria-hidden={!libraryOpen}
      aria-label="Library and setup"
    >
      <Drawer
        songs={
          <SongLibrary
            library={library}
            localScores={localScores}
            activeId={activeScore?.id}
            onPick={onPickSong}
            onLoadFile={onLoadFile}
            window={keyWindow}
            starsBySong={starsBySong}
            starRates={starRates}
            suggestedId={suggestedId}
            onListen={onListen}
          />
        }
        path={
          <PathTab
            state={path.state}
            set={path.set}
            dailyProgress={path.progress}
            library={library}
            days={days}
            goalMinutes={goalMinutes}
            onGoalChange={onGoalChange}
            onPick={onPickSong}
            benchmark={path.benchmark}
            decay={path.decay}
            badges={path.badges}
            streak={path.streak}
          />
        }
        progress={
          <ProgressTab
            days={days}
            goalMinutes={goalMinutes}
            onGoalChange={onGoalChange}
            library={library}
            starsBySong={starsBySong}
            onPick={onPickSong}
            onRestored={onRestored}
          />
        }
        keyboard={
          <KeyboardPanel
            deviceName={deviceName}
            profile={profile}
            profileId={profileId}
            onProfileChange={onProfileChange}
            window={keyWindow}
            onShiftOctave={onShiftOctave}
            onResetOctave={onResetOctave}
            autoDetected={autoDetected}
            fit={fit}
            onFitChange={onFitChange}
            assessment={assessment}
            latencyMs={latencyMs}
            onCalibrate={onCalibrate}
            velocityCurve={velocityCurve}
            onCalibrateTouch={onCalibrateTouch}
            instrumentSource={instrumentSource}
            onInstrumentSourceChange={onInstrumentSourceChange}
            outputs={outputs}
            selectedOutputId={selectedOutputId}
            onSelectOutput={onSelectOutput}
            forwardInput={forwardInput}
            onForwardInputChange={onForwardInputChange}
            onLoadSamples={onLoadSamples}
            pieceRange={pieceRange}
            onMoveWindow={onMoveWindow}
          />
        }
      />
    </aside>
  );
});

export default LibraryDrawer;
