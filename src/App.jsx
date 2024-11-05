import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Settings from './components/Settings';
import AddDNSRecord from './components/AddDNSRecord';
import ZoneEditor from './components/ZoneEditor';
import { ConfigProvider } from './context/ConfigContext';

function App() {
  return (
    <ConfigProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<AddDNSRecord />} />
            <Route path="/zones" element={<ZoneEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </Router>
    </ConfigProvider>
  );
}

export default App; 