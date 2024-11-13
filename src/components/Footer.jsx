import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';

function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        backgroundColor: 'background.paper',
        borderTopLeftRadius: 8,
        boxShadow: 1,
        zIndex: 1200,
      }}
    >
      <Link
        href="https://github.com/ttpears/snap-dns"
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          textDecoration: 'none',
          color: 'text.primary',
          '&:hover': {
            color: 'primary.main',
          },
        }}
      >
        <GitHubIcon fontSize="small" />
        <Typography variant="body2">GitHub</Typography>
      </Link>
    </Box>
  );
}

export default Footer; 