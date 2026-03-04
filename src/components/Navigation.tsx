import React from 'react';
import { List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { Add, Settings, Storage, Backup } from '@mui/icons-material';
import KeySelector from './KeySelector';

function Navigation() {
  const location = useLocation();

  const menuItems = [
    { text: 'Add DNS Record', icon: <Add />, path: '/' },
    { text: 'Zone Editor', icon: <Storage />, path: '/zones' },
    { text: 'Snapshots', icon: <Backup />, path: '/snapshots' },
    { text: 'Settings', icon: <Settings />, path: '/settings' },
  ];

  return (
    <>
      <Box 
        sx={{ 
          p: 2, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: 1 
        }}
      >
        <img src="/logo192.png" alt="SnapDNS" style={{ width: 32, height: 32 }} />
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          SnapDNS
        </Typography>
      </Box>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem
            key={item.path}
            component={Link}
            to={item.path}
            selected={location.pathname === item.path}
            sx={{
              color: 'text.primary',
              textDecoration: 'none',
              '&.Mui-selected': {
                backgroundColor: 'action.selected',
              },
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
      <Divider />
      <KeySelector />
    </>
  );
}

export default Navigation; 