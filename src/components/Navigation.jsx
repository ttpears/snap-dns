import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { Add as AddIcon, Storage as StorageIcon, Settings as SettingsIcon } from '@mui/icons-material';

function Navigation() {
  const location = useLocation();

  return (
    <List>
      <ListItem 
        component={Link} 
        to="/"
        selected={location.pathname === '/'}
        sx={{ 
          textDecoration: 'none',
          color: 'inherit'
        }}
      >
        <ListItemIcon>
          <AddIcon />
        </ListItemIcon>
        <ListItemText primary="Add DNS Record" />
      </ListItem>
      <ListItem 
        component={Link} 
        to="/zones"
        selected={location.pathname === '/zones'}
        sx={{ 
          textDecoration: 'none',
          color: 'inherit'
        }}
      >
        <ListItemIcon>
          <StorageIcon />
        </ListItemIcon>
        <ListItemText primary="Zone Editor" />
      </ListItem>
      <ListItem 
        component={Link} 
        to="/settings"
        selected={location.pathname === '/settings'}
        sx={{ 
          textDecoration: 'none',
          color: 'inherit'
        }}
      >
        <ListItemIcon>
          <SettingsIcon />
        </ListItemIcon>
        <ListItemText primary="Settings" />
      </ListItem>
    </List>
  );
}

export default Navigation; 