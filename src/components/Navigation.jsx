import React from 'react';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Edit as EditIcon,
  Backup as BackupIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/zones', label: 'Zone Editor', icon: <EditIcon /> },
    { path: '/add', label: 'Add DNS Record', icon: <AddIcon /> },
    { path: '/backup', label: 'Backup & Import', icon: <BackupIcon /> },
    { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  return (
    <List>
      {menuItems.map((item, index) => (
        <React.Fragment key={item.path}>
          {index > 0 && <Divider />}
          <ListItem
            button
            selected={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItem>
        </React.Fragment>
      ))}
    </List>
  );
}

export default Navigation; 