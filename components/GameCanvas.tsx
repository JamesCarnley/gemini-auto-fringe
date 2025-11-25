import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GameState, EntityType, Entity, Vector2, GameEventType } from '../types';
import { createPlayer, createAsteroid, updateGame } from '../services/gameLogic';
import { CANVAS_WIDTH, CANVAS_HEIGHT, ARENA_RADIUS, COLOR_PALETTE, SVG_PATHS } from '../constants';
import { dist, randomRange } from '../utils/math';

// --- Sound Engine ---
class AudioController {
    ctx: AudioContext | null = null;
    masterGain: GainNode | null = null;
    thrustOsc: OscillatorNode | null = null;
    thrustGain: GainNode | null = null;
    musicNodes: AudioNode[] = [];
    initialized: boolean = false;

    init() {
        if (this.initialized) return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.25; // Overall Volume
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;

        this.startMusic();
        this.setupThrustSound();
    }

    startMusic() {
        if (!this.ctx || !this.masterGain) return;
        // Dark Drone Ambient
        const createDrone = (freq: number, type: 'sawtooth' | 'triangle', pan: number) => {
            if (!this.ctx || !this.masterGain) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const panner = this.ctx.createStereoPanner();
            const filter = this.ctx.createBiquadFilter();

            osc.type = type;
            osc.frequency.value = freq;
            
            filter.type = 'lowpass';
            filter.frequency.value = 150;
            
            // LFO for filter
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = 0.1 + Math.random() * 0.1;
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 50;
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);
            lfo.start();

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(panner);
            panner.connect(this.masterGain);

            panner.pan.value = pan;
            gain.gain.value = 0.1;

            osc.start();
            this.musicNodes.push(osc, gain, panner, filter, lfo, lfoGain);
        };

        createDrone(55, 'sawtooth', -0.5); // A1
        createDrone(56, 'sawtooth', 0.5);  // Detuned A1
        createDrone(110, 'triangle', 0);   // A2
    }

    setupThrustSound() {
        if (!this.ctx || !this.masterGain) return;
        // Pink/Brown noise buffer would be best, but let's use a low oscillator with modulation for engine rumble
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.value = 50;
        
        filter.type = 'lowpass';
        filter.frequency.value = 200;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        gain.gain.value = 0; // Start silent
        osc.start();

        this.thrustOsc = osc;
        this.thrustGain = gain;
    }

    setThrust(active: boolean) {
        if (!this.thrustGain || !this.ctx) return;
        const now = this.ctx.currentTime;
        if (active) {
            this.thrustGain.gain.setTargetAtTime(0.3, now, 0.1);
            if (this.thrustOsc) this.thrustOsc.frequency.setTargetAtTime(80, now, 0.2);
        } else {
            this.thrustGain.gain.setTargetAtTime(0, now, 0.1);
            if (this.thrustOsc) this.thrustOsc.frequency.setTargetAtTime(40, now, 0.2);
        }
    }

    playShoot(type: 'player' | 'enemy') {
        if (!this.ctx || !this.masterGain) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        if (type === 'player') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, t);
            osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.2);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.25);
        }
    }

    playExplosion() {
        if (!this.ctx || !this.masterGain) return;
        const t = this.ctx.currentTime;
        
        const oscCount = 5;
        for(let i=0; i<oscCount; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.type = 'sawtooth';
            osc.frequency.value = 50 + Math.random() * 100;
            osc.frequency.exponentialRampToValueAtTime(10, t + 0.5);
            
            gain.gain.setValueAtTime(0.2 / oscCount, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            
            osc.start(t);
            osc.stop(t + 0.6);
        }
    }

    playImpact() {
        if (!this.ctx || !this.masterGain) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.1);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        osc.start(t);
        osc.stop(t + 0.1);
    }
}

const audioController = new AudioController();

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

interface Nebula {
    x: number;
    y: number;
    radius: number;
    color: string;
}

const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const pathsRef = useRef<Record<string, Path2D>>({});
  const starsRef = useRef<Star[]>([]);
  const nebulaeRef = useRef<Nebula[]>([]);
  
  // Mutable game state
  const gameStateRef = useRef<GameState>({
    player: createPlayer(),
    entities: [],
    particles: [],
    projectiles: [],
    score: 0,
    wave: 1,
    arenaRadius: ARENA_RADIUS,
    camera: { x: 0, y: 0 },
    gameOver: false,
    paused: false,
    lastTime: 0,
    events: [],
  });

  const [hudState, setHudState] = useState({ 
    score: 0, 
    shield: 100, 
    health: 100, 
    wave: 1, 
    gameOver: false 
  });

  const [audioStarted, setAudioStarted] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0); // 1.0 = Normal, 0.5 = Zoomed Out

  // Initialize Paths, Stars, and Nebulae
  useEffect(() => {
    // Compile SVG Paths
    pathsRef.current = {
      [EntityType.PLAYER]: new Path2D(SVG_PATHS.PLAYER),
      [EntityType.ENEMY_SCOUT]: new Path2D(SVG_PATHS.ENEMY_SCOUT),
      [EntityType.ENEMY_CRUISER]: new Path2D(SVG_PATHS.ENEMY_CRUISER),
      [EntityType.ENEMY_INTERCEPTOR]: new Path2D(SVG_PATHS.ENEMY_INTERCEPTOR),
      [EntityType.ENEMY_BOMBER]: new Path2D(SVG_PATHS.ENEMY_BOMBER),
    };

    // Generate Stars
    const stars: Star[] = [];
    for(let i=0; i<400; i++) {
      stars.push({
        x: Math.random() * ARENA_RADIUS * 3 - ARENA_RADIUS * 1.5,
        y: Math.random() * ARENA_RADIUS * 3 - ARENA_RADIUS * 1.5,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.7 + 0.1
      });
    }
    starsRef.current = stars;

    // Generate Nebulae
    const nebulae: Nebula[] = [];
    const colors = ['rgba(76, 29, 149, 0.15)', 'rgba(30, 58, 138, 0.15)', 'rgba(88, 28, 135, 0.1)'];
    for(let i=0; i<12; i++) {
        nebulae.push({
            x: randomRange(-ARENA_RADIUS, ARENA_RADIUS),
            y: randomRange(-ARENA_RADIUS, ARENA_RADIUS),
            radius: randomRange(400, 900),
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    nebulaeRef.current = nebulae;

    // Game Init
    const state = gameStateRef.current;
    if (state.entities.length === 0) { // Prevent double init
        for (let i = 0; i < 30; i++) {
            const r = Math.random() * ARENA_RADIUS;
            const theta = Math.random() * Math.PI * 2;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            
            if (dist({x,y}, {x:0,y:0}) > 300) {
                const size = Math.random() > 0.8 ? 'large' : (Math.random() > 0.5 ? 'medium' : 'small');
                state.entities.push(createAsteroid(x, y, size));
            }
        }
    }
  }, []);

  const handleClick = () => {
    // 1. Initialize Audio if needed
    if (!audioStarted) {
        audioController.init();
        if (audioController.ctx && audioController.ctx.state === 'suspended') {
            audioController.ctx.resume();
        }
        setAudioStarted(true);
    } 
    
    // 2. Toggle Zoom (only if game is running/ready)
    setZoomLevel(prev => prev === 1.0 ? 0.5 : 1.0);
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, e: Entity) => {
    ctx.save();
    ctx.translate(e.position.x, e.position.y);
    ctx.rotate(e.rotation);

    // Dynamic Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = e.color;

    // Metallic Gradient Fill
    const grad = ctx.createLinearGradient(-e.radius, -e.radius, e.radius, e.radius);
    // Darker version of color
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, e.color);
    grad.addColorStop(1, '#000000');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;

    // Use cached Path2D if available
    const path = pathsRef.current[e.type];

    if (path) {
        // CORRECTION: SVG paths are drawn facing Up (-Y). 
        // Game math assumes 0 rotation is Right (+X).
        // Rotate 90 degrees (PI/2) to align Visual Up with Math Right.
        ctx.rotate(Math.PI / 2);

        ctx.fill(path);
        ctx.stroke(path);
        
        // Engine Glow for Player
        if (e.type === EntityType.PLAYER && e.thrusting) {
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.moveTo(-6, 14);
            ctx.lineTo(0, 24 + Math.random() * 10);
            ctx.lineTo(6, 14);
            ctx.fill();
        }
    } else {
        // Procedural fallbacks (Mines, Asteroids, Projectiles)
        
        if (e.type === EntityType.MINE) {
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#aa0000';
            ctx.fill();
            ctx.strokeStyle = '#ff3333';
            ctx.stroke();
            // Spikes
            for (let i = 0; i < 8; i++) {
                ctx.rotate(Math.PI / 4);
                ctx.beginPath();
                ctx.moveTo(8, 0);
                ctx.lineTo(14, 0);
                ctx.stroke();
            }
            // Blinking Core
            if (Math.floor(Date.now() / 200) % 2 === 0) {
                 ctx.beginPath();
                 ctx.arc(0, 0, 4, 0, Math.PI * 2);
                 ctx.fillStyle = '#ffaaaa';
                 ctx.fill();
            }
        } 
        else if (e.type === EntityType.ASTEROID) {
            ctx.shadowBlur = 0; // No glow for rocks
            ctx.fillStyle = '#222';
            ctx.strokeStyle = '#555';
            ctx.beginPath();
            const sides = 7;
            for (let i = 0; i < sides; i++) {
              const angle = (i / sides) * Math.PI * 2;
              const r = e.radius * (0.8 + Math.sin(angle * 3 + e.id.length) * 0.2); 
              ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        else if (e.type === EntityType.PROJECTILE) {
            ctx.fillStyle = e.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            // Elongated bolt
            ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff'; // Bright core
            ctx.beginPath();
            ctx.arc(0, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        else if (e.type === EntityType.PARTICLE) {
            ctx.globalAlpha = e.lifetime ? e.lifetime / 30 : 1;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // Shield Bubble (Overlay) - Restore rotation if we modified it for SVG
    if (path) {
         ctx.rotate(-Math.PI / 2);
    }
    
    if (e.shield && e.shield > 20) {
        ctx.shadowBlur = 5;
        ctx.shadowColor = COLOR_PALETTE.playerShield;
        ctx.strokeStyle = `rgba(0, 255, 204, ${e.shield / 200})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
  };

  const drawStarfield = (ctx: CanvasRenderingContext2D, camera: Vector2) => {
    // 0. Base Deep Space Fill
    const bgGrad = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 0, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
    bgGrad.addColorStop(0, '#0f1220');
    bgGrad.addColorStop(1, '#000000');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Nebulae (Deep parallax)
    ctx.save();
    // Parallax logic remains largely screen-space based
    ctx.translate(-camera.x * 0.1 + CANVAS_WIDTH / 2, -camera.y * 0.1 + CANVAS_HEIGHT / 2);
    nebulaeRef.current.forEach(n => {
        // Culling
        const screenX = n.x - camera.x * 0.1;
        const screenY = n.y - camera.y * 0.1;
        if (Math.abs(screenX) > CANVAS_WIDTH + n.radius && Math.abs(screenY) > CANVAS_HEIGHT + n.radius) return;

        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
        g.addColorStop(0, n.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();

    // 2. Starfield
    ctx.save();
    // Parallax: Move stars slower than camera (0.5 factor)
    ctx.translate(-camera.x * 0.5 + CANVAS_WIDTH / 2, -camera.y * 0.5 + CANVAS_HEIGHT / 2);
    
    ctx.fillStyle = '#fff';
    starsRef.current.forEach((star, i) => {
        // Simple culling if way off screen
        const screenX = star.x - camera.x * 0.5;
        const screenY = star.y - camera.y * 0.5;
        if (Math.abs(screenX) > CANVAS_WIDTH && Math.abs(screenY) > CANVAS_HEIGHT) return;

        // Twinkle
        const twinkle = Math.sin(Date.now() * 0.005 + i) * 0.2 + 0.8;
        ctx.globalAlpha = star.opacity * twinkle;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  const drawGridAndWorld = (ctx: CanvasRenderingContext2D, state: GameState, zoom: number) => {
    // 3. Grid (World locked) - More subtle
    const gridSize = 150;
    
    // We are in World Space here due to outer transform, so we can draw lines across the arena
    // Visible World Bounds
    const visibleWidth = CANVAS_WIDTH / zoom;
    const visibleHeight = CANVAS_HEIGHT / zoom;
    const left = state.camera.x - visibleWidth / 2;
    const right = state.camera.x + visibleWidth / 2;
    const top = state.camera.y - visibleHeight / 2;
    const bottom = state.camera.y + visibleHeight / 2;

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.08)'; // Very subtle cyan
    ctx.lineWidth = 1; // Keep thin even if zoomed? No, in world space 1 is 1 unit.
    // To keep line width consistent on screen (1px), we divide by zoom
    ctx.lineWidth = 1 / zoom; 

    ctx.beginPath();
    for (let x = startX; x < right; x += gridSize) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y < bottom; y += gridSize) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    // 4. Arena Boundary
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([20, 20]); // Dashed border
    ctx.stroke();
    // Inner Glow
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff0055';
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_RADIUS - 5, 0, Math.PI * 2);
    ctx.lineWidth = 2 / zoom;
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.5)';
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
  };

  const drawRadar = (ctx: CanvasRenderingContext2D, state: GameState) => {
    const radarSize = 100;
    const radarX = CANVAS_WIDTH - radarSize - 20;
    const radarY = radarSize + 20;
    const scale = radarSize / ARENA_RADIUS;

    // Background with gradient
    const grad = ctx.createRadialGradient(radarX, radarY, 0, radarX, radarY, radarSize);
    grad.addColorStop(0, 'rgba(0, 40, 20, 0.9)');
    grad.addColorStop(1, 'rgba(0, 10, 5, 0.9)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radarX, radarY, radarSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Radar rings
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)';
    ctx.beginPath(); ctx.arc(radarX, radarY, radarSize * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(radarX, radarY, radarSize * 0.25, 0, Math.PI * 2); ctx.stroke();

    // Entities
    [state.player, ...state.entities].forEach(e => {
        if(e.isDead && e.type !== EntityType.PLAYER) return; // Show dead player marker
        // Project onto radar
        const rx = e.position.x * scale;
        const ry = e.position.y * scale;
        
        // Clip to radar radius
        if (Math.sqrt(rx*rx + ry*ry) > radarSize) return;

        const x = radarX + rx;
        const y = radarY + ry;

        ctx.fillStyle = e.color;
        if (e.type === EntityType.PLAYER) ctx.fillStyle = '#fff';
        
        ctx.beginPath();
        if (e.type === EntityType.PLAYER) {
             // Draw small arrow for player
             ctx.save();
             ctx.translate(x, y);
             ctx.rotate(e.rotation);
             ctx.moveTo(4, 0);
             ctx.lineTo(-3, 3);
             ctx.lineTo(-3, -3);
             ctx.fill();
             ctx.restore();
        } else {
             ctx.arc(x, y, e.type === EntityType.ASTEROID ? 1.5 : 2.5, 0, Math.PI * 2);
             ctx.fill();
        }
    });
  };

  const processEvents = (state: GameState) => {
      // Limit events per frame to prevent audio overload/crash
      let shootCount = 0;
      let explosionCount = 0;
      let impactCount = 0;

      state.events.forEach(event => {
          switch(event) {
              case GameEventType.PLAYER_SHOOT:
                  if (shootCount < 3) audioController.playShoot('player');
                  shootCount++;
                  break;
              case GameEventType.ENEMY_SHOOT:
                  if(Math.random() > 0.7 && shootCount < 5) {
                      audioController.playShoot('enemy');
                      shootCount++;
                  }
                  break;
              case GameEventType.EXPLOSION:
                  if (explosionCount < 3) audioController.playExplosion();
                  explosionCount++;
                  break;
              case GameEventType.IMPACT:
                  if (impactCount < 5) audioController.playImpact();
                  impactCount++;
                  break;
              case GameEventType.GAME_OVER:
                  audioController.playExplosion();
                  break;
          }
      });
      state.events = [];
      audioController.setThrust(state.player.thrusting && !state.player.isDead);
  };

  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = gameStateRef.current;

    // 1. Process Logic
    updateGame(state);
    
    // 2. Process Audio
    if (audioStarted) {
        processEvents(state);
    } else {
        state.events = [];
    }

    // Camera follow player
    state.camera.x = state.player.position.x;
    state.camera.y = state.player.position.y;

    // Draw Background (Screen Space)
    drawStarfield(ctx, state.camera);

    // World Transforms with ZOOM
    ctx.save();
    
    // 1. Move origin to center of screen
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    // 2. Apply Scale
    ctx.scale(zoomLevel, zoomLevel);
    // 3. Move world so camera is at origin
    ctx.translate(-state.camera.x, -state.camera.y);

    // Draw Grid & Boundaries
    drawGridAndWorld(ctx, state, zoomLevel);

    // Draw Layers
    state.particles.forEach(p => drawEntity(ctx, p));
    state.projectiles.forEach(p => drawEntity(ctx, p));
    state.entities.forEach(e => drawEntity(ctx, e));
    
    // Draw player
    drawEntity(ctx, state.player);

    ctx.restore();

    // UI Layer (Screen Space)
    drawRadar(ctx, state);

    // Sync HUD
    if (state.lastTime % 10 === 0 || state.gameOver !== hudState.gameOver) {
      setHudState({
        score: state.score,
        shield: state.player.shield || 0,
        health: state.player.health,
        wave: state.wave,
        gameOver: state.gameOver
      });
    }

    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [audioStarted, zoomLevel]); // Re-bind loop if zoom changes (though ref based state helps, simpler to just rebind or rely on ref)

  const handleRestart = () => {
      // Don't toggle zoom on restart, just restart
      if (!audioStarted) handleClick(); // ensure audio
      
      gameStateRef.current.player = createPlayer();
      gameStateRef.current.entities = [];
      gameStateRef.current.projectiles = [];
      gameStateRef.current.particles = [];
      gameStateRef.current.score = 0;
      gameStateRef.current.wave = 1;
      gameStateRef.current.gameOver = false;
      gameStateRef.current.lastTime = 0;
      gameStateRef.current.events = [];
      
      for (let i = 0; i < 30; i++) {
        const r = Math.random() * ARENA_RADIUS;
        const theta = Math.random() * Math.PI * 2;
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        if (dist({x,y}, {x:0,y:0}) > 300) {
            const size = Math.random() > 0.8 ? 'large' : (Math.random() > 0.5 ? 'medium' : 'small');
            gameStateRef.current.entities.push(createAsteroid(x, y, size));
        }
      }
      
      // Force UI update immediately
      setHudState({ score: 0, shield: 100, health: 100, wave: 1, gameOver: false });
  };

  return (
    <div className="relative w-full h-full" onClick={handleClick}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block w-full h-full cursor-crosshair"
      />
      
      {/* Scanlines Effect */}
      <div className="absolute inset-0 pointer-events-none" 
           style={{
             background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
             backgroundSize: '100% 2px, 3px 100%'
           }}>
      </div>

      {!audioStarted && !hudState.gameOver && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 text-green-500 font-mono text-xs animate-pulse pointer-events-none">
              [ CLICK TO ENGAGE SYSTEMS ]
          </div>
      )}

      {/* HUD */}
      <div className="absolute top-4 left-4 font-mono text-green-400 select-none pointer-events-none">
        <h1 className="text-xl font-bold tracking-widest uppercase mb-2">Auto-Fringe AI</h1>
        <div className="text-sm">SECTOR: 7G</div>
        <div className="text-sm">WAVE: {hudState.wave}</div>
        <div className="text-sm mt-2">SCORE: {hudState.score.toString().padStart(6, '0')}</div>
        <div className="text-xs text-cyan-500 mt-2">ZOOM: {zoomLevel}x</div>
      </div>

      {/* Shield/Health Bars */}
      <div className="absolute top-4 right-4 w-64 p-4 font-mono select-none pointer-events-none flex flex-col items-end gap-2">
         <div className="w-full flex items-center justify-end gap-2">
            <span className="text-cyan-400 text-xs">SHIELD</span>
            <div className="w-32 h-2 bg-gray-800 border border-gray-600">
                <div className="h-full bg-cyan-400 shadow-[0_0_10px_#00ffcc]" style={{ width: `${Math.max(0, hudState.shield)}%` }}></div>
            </div>
         </div>
         <div className="w-full flex items-center justify-end gap-2">
            <span className="text-red-500 text-xs">HULL</span>
            <div className="w-32 h-2 bg-gray-800 border border-gray-600">
                <div className="h-full bg-red-500 shadow-[0_0_10px_#ff0000]" style={{ width: `${Math.max(0, hudState.health)}%` }}></div>
            </div>
         </div>
         <div className="text-xs text-gray-400 mt-2">
             SYSTEM STATUS: {hudState.gameOver ? 'CRITICAL FAILURE' : 'ONLINE'}
         </div>
         <div className="text-xs text-gray-400">
            AUTO-PILOT: {hudState.gameOver ? 'OFFLINE' : 'ENGAGED'}
         </div>
      </div>

      {/* Game Over Screen */}
      {hudState.gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
           <div className="text-center border-2 border-red-500 p-8 bg-black box-shadow-xl shadow-[0_0_50px_rgba(255,0,0,0.5)]">
              <h2 className="text-4xl font-bold text-red-500 mb-4 tracking-widest">MISSION FAILED</h2>
              <p className="text-green-400 mb-6 font-mono">FINAL SCORE: {hudState.score}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); handleRestart(); }}
                className="px-6 py-2 bg-red-900/50 hover:bg-red-800 text-red-100 font-mono border border-red-500 uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(255,0,0,0.6)] cursor-pointer pointer-events-auto"
              >
                Re-Initialize Sequence
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default GameCanvas;