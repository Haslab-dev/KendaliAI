import React from 'react';
import { SettingsScreen } from './SettingsScreen';

export const ControlCenterView: React.FC<{ section?: string }> = ({ section }) => {
  return <SettingsScreen section={section} />;
};

export default ControlCenterView;
