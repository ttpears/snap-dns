import React from 'react';
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Container, 
  Box,
  Tabs,
  Tab
} from '@mui/material';

function Layout() {
  const location = useLocation();

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Snap DNS Manager
          </Typography>
        </Toolbar>
        <Tabs 
          value={location.pathname} 
          textColor="inherit"
          indicatorColor="secondary"
        >
          <Tab 
            label="DNS Records" 
            value="/" 
            component={RouterLink} 
            to="/" 
          />
          <Tab 
            label="Pending Changes" 
            value="/pending" 
            component={RouterLink} 
            to="/pending" 
          />
          <Tab 
            label="Demo Mode" 
            value="/demo" 
            component={RouterLink} 
            to="/demo" 
          />
          <Tab 
            label="Settings" 
            value="/settings" 
            component={RouterLink} 
            to="/settings" 
          />
          <Tab 
            label="Zone Viewer" 
            value="/viewer" 
            component={RouterLink} 
            to="/viewer" 
          />
        </Tabs>
      </AppBar>
      <Container maxWidth="lg">
        <Box sx={{ mt: 4 }}>
          <Outlet />
        </Box>
      </Container>
    </>
  );
}

export default Layout; 