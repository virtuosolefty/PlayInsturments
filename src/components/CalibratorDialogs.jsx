/**
 * CalibratorDialogs — extracted from App.jsx
 *
 * Manages latency and touch velocity calibration dialogs.
 */

import { memo } from 'react';
import LatencyCalibrator from './LatencyCalibrator.jsx';
import TouchCalibrator from './TouchCalibrator.jsx';

const CalibratorDialogs = memo(function CalibratorDialogs({
  calibrating,
  onCloseCalibrateLatency,
  onApplyCalibrateLatency,
  latencyMs,
  calibratingTouch,
  onCalibrateTouchClose,
  onCalibrateTouchApply,
  velocityCurve,
}) {
  return (
    <>
      {calibrating && (
        <LatencyCalibrator
          currentMs={latencyMs}
          onApply={onApplyCalibrateLatency}
          onClose={onCloseCalibrateLatency}
        />
      )}

      {calibratingTouch && (
        <TouchCalibrator
          current={velocityCurve}
          onApply={onCalibrateTouchApply}
          onClose={onCalibrateTouchClose}
        />
      )}
    </>
  );
});

export default CalibratorDialogs;
