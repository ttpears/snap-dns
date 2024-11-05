import React from 'react';
import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import Navigation from './Navigation';
import { useConfig } from '../context/ConfigContext';

function Layout({ children }) {
  const location = useLocation();
  const theme = useTheme();
  const { toggleDarkMode } = useConfig();
  
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Add DNS Record';
      case '/zones':
        return 'Zone Editor';
      case '/settings':
        return 'Settings';
      default:
        return '';
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      minHeight: '100vh',
      bgcolor: 'background.default',
      color: 'text.primary'
    }}>
      <Box sx={{ 
        width: 240, 
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider'
      }}>
        <Navigation />
      </Box>
      <Box sx={{ flexGrow: 1, p: 3 }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          mb: 3
        }}>
          <Typography variant="h6">
            {getPageTitle()}
          </Typography>
          <IconButton onClick={toggleDarkMode} color="inherit">
            {theme.palette.mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
          </IconButton>
        </Box>
        {children}
      </Box>
    </Box>
  );
}

export default Layout; 