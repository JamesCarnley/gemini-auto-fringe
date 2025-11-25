import React from 'react';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative">
      <GameCanvas />
    </div>
  );
};

export default App;