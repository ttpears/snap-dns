import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Box,
  Alert,
  TextField,
  Select,
  MenuItem,
} from '@mui/material';
import { usePendingChanges } from '../context/PendingChangesContext';
import { qualifyDnsName } from '../utils/utils';

function DemoMode() {
  const [activeStep, setActiveStep] = useState(0);
  const { addPendingChange, pendingChanges, clearChanges } = usePendingChanges();
  const [demoInput, setDemoInput] = useState({
    zone: 'example.com',
    recordType: 'A',
    name: 'demo',
    value: '192.168.1.100',
    ttl: 3600
  });

  const steps = [
    {
      label: 'Introduction',
      content: (
        <>
          <Typography paragraph>
            Welcome to the Snap DNS Manager Demo! This guided tour will show you how to:
          </Typography>
          <ul>
            <li>Add DNS records to pending changes</li>
            <li>Review pending changes</li>
            <li>Apply changes safely</li>
            <li>Validate records against different resolvers</li>
          </ul>
        </>
      )
    },
    {
      label: 'Adding a Record',
      content: (
        <>
          <Typography paragraph>
            Let's add a sample A record. In a real environment, you would select your zone
            from the available zones list.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Select
              fullWidth
              value={demoInput.zone}
              onChange={(e) => setDemoInput({ ...demoInput, zone: e.target.value })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="example.com">example.com</MenuItem>
              <MenuItem value="demo.local">demo.local</MenuItem>
            </Select>

            <Select
              fullWidth
              value={demoInput.recordType}
              onChange={(e) => setDemoInput({ ...demoInput, recordType: e.target.value })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="A">A</MenuItem>
              <MenuItem value="AAAA">AAAA</MenuItem>
              <MenuItem value="CNAME">CNAME</MenuItem>
            </Select>

            <TextField
              fullWidth
              label="Record Name"
              value={demoInput.name}
              onChange={(e) => setDemoInput({ ...demoInput, name: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Record Value"
              value={demoInput.value}
              onChange={(e) => setDemoInput({ ...demoInput, value: e.target.value })}
              sx={{ mb: 2 }}
            />

            <Button
              variant="contained"
              onClick={() => {
                addPendingChange({
                  ...demoInput,
                  command: `update add ${demoInput.name}.${demoInput.zone} ${demoInput.ttl} ${demoInput.recordType} ${demoInput.value}`
                });
              }}
            >
              Add to Pending Changes
            </Button>
          </Box>
        </>
      )
    },
    {
      label: 'Review Changes',
      content: (
        <>
          <Typography paragraph>
            Before applying changes, always review them carefully. Here are your pending changes:
          </Typography>
          {pendingChanges.length > 0 ? (
            <Box sx={{ mt: 2 }}>
              {pendingChanges.map((change, index) => (
                <Alert key={index} severity="info" sx={{ mb: 1 }}>
                  {change.type === 'ADD' 
                    ? `${qualifyDnsName(change.name, change.zone)} ${change.recordType} ${change.value}`
                    : `${qualifyDnsName(change.record.name, change.zone)} ${change.record.type} ${change.record.value}`
                  }
                </Alert>
              ))}
            </Box>
          ) : (
            <Alert severity="warning">
              No pending changes. Go back and add a record first!
            </Alert>
          )}
        </>
      )
    },
    {
      label: 'Validation',
      content: (
        <>
          <Typography paragraph>
            In a production environment, you can validate records against different resolvers:
          </Typography>
          <ul>
            <li>Internal resolver (default)</li>
            <li>1.1.1.1 (Cloudflare)</li>
            <li>8.8.8.8 (Google)</li>
          </ul>
          <Alert severity="info" sx={{ mt: 2 }}>
            Demo Mode: Validation is simulated. In production, real DNS queries will be performed.
          </Alert>
        </>
      )
    },
    {
      label: 'Completion',
      content: (
        <>
          <Typography paragraph>
            Congratulations! You've completed the demo. Here's what you've learned:
          </Typography>
          <ul>
            <li>How to add DNS records to pending changes</li>
            <li>How to review changes before applying them</li>
            <li>How validation works with different resolvers</li>
          </ul>
          <Button
            variant="contained"
            onClick={() => clearChanges()}
            sx={{ mt: 2 }}
          >
            Clear Demo Changes
          </Button>
        </>
      )
    }
  ];

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    clearChanges();
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Demo Mode
      </Typography>
      
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((step) => (
          <Step key={step.label}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ mt: 2, mb: 2 }}>
        {steps[activeStep].content}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        <Box>
          <Button
            onClick={handleReset}
            sx={{ mr: 1 }}
          >
            Reset Demo
          </Button>
          {activeStep === steps.length - 1 ? (
            <Button 
              variant="contained"
              onClick={handleReset}
            >
              Start Over
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
            >
              Next
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

export default DemoMode; 