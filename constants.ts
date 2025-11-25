export const CANVAS_WIDTH = window.innerWidth;
export const CANVAS_HEIGHT = window.innerHeight;
export const ARENA_RADIUS = 1500;

export const FRICTION = 0.98;
export const PLAYER_ACCEL = 0.4;
export const PLAYER_ROTATION_SPEED = 0.08;
export const PLAYER_MAX_SPEED = 8;
export const PROJECTILE_SPEED = 12;
export const PROJECTILE_LIFETIME = 80;

export const COLOR_PALETTE = {
  background: '#050505',
  player: '#00ffcc', // Cyan neon
  playerShield: 'rgba(0, 255, 204, 0.3)',
  enemyScout: '#ff0055', // Red neon
  enemyCruiser: '#ff9900', // Orange neon
  enemyInterceptor: '#fff200', // Yellow neon
  enemyBomber: '#d000ff', // Purple neon
  mine: '#ff3333', // Red alert
  asteroid: '#888888',
  projectilePlayer: '#ccff00', // Lime
  projectileEnemy: '#ff0000',
  radarBg: 'rgba(0, 20, 0, 0.8)',
  radarLine: '#00ff00',
};

export const ENEMY_SPAWN_RATE = 200; // frames

// SVG Path Data for entities
export const SVG_PATHS = {
  // Sleek delta fighter
  PLAYER: "M0 -22 L14 14 L0 8 L-14 14 Z", 
  
  // Fast, sharp insectoid
  ENEMY_SCOUT: "M0 -18 L10 8 L0 18 L-10 8 Z", 
  
  // Bulky, industrial H-shape
  ENEMY_CRUISER: "M-14 -20 L14 -20 L20 -8 L20 8 L14 20 L-14 20 L-20 8 L-20 -8 Z",
  
  // Aggressive forward-swept wings
  ENEMY_INTERCEPTOR: "M0 -24 L6 -4 L18 10 L4 6 L0 14 L-4 6 L-18 10 L-6 -4 Z",
  
  // Heavy Hexagon
  ENEMY_BOMBER: "M0 -22 L19 -11 L19 11 L0 22 L-19 11 L-19 -11 Z",
};