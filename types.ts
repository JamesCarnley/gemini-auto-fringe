export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY_SCOUT = 'ENEMY_SCOUT',
  ENEMY_CRUISER = 'ENEMY_CRUISER',
  ENEMY_INTERCEPTOR = 'ENEMY_INTERCEPTOR',
  ENEMY_BOMBER = 'ENEMY_BOMBER',
  MINE = 'MINE',
  ASTEROID = 'ASTEROID',
  PROJECTILE = 'PROJECTILE',
  PARTICLE = 'PARTICLE',
  POWERUP = 'POWERUP'
}

export enum PowerUpType {
  HEALTH_PACK = 'HEALTH_PACK',      // Instant: +50 Health
  SHIELD_OVERCHARGE = 'SHIELD_OVERCHARGE', // Instant: +100 Shield (can go over max)
  RAPID_FIRE = 'RAPID_FIRE',        // Effect: 4x Fire rate
  SCATTER_SHOT = 'SCATTER_SHOT',    // Effect: Shotgun spread
  TIME_WARP = 'TIME_WARP',          // Effect: Slow enemies to 20%
  OMEGA_BLAST = 'OMEGA_BLAST'       // Instant: Destroy all visible enemies
}

export enum GameEventType {
  PLAYER_SHOOT = 'PLAYER_SHOOT',
  ENEMY_SHOOT = 'ENEMY_SHOOT',
  EXPLOSION = 'EXPLOSION',
  IMPACT = 'IMPACT',
  GAME_OVER = 'GAME_OVER',
  POWERUP_COLLECT = 'POWERUP_COLLECT',
  NUKE_TRIGGERED = 'NUKE_TRIGGERED'
}

export interface ActiveEffect {
  type: PowerUpType;
  duration: number;
  maxDuration: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  position: Vector2;
  velocity: Vector2;
  rotation: number; // radians
  radius: number;
  health: number;
  maxHealth: number;
  color: string;
  isDead: boolean;
  // AI/Gameplay stats
  cooldown: number;
  maxCooldown: number;
  thrusting: boolean;
  shield?: number;
  maxShield?: number;
  scoreValue?: number;
  lifetime?: number; // For particles/projectiles/mines
  
  // PowerUp specifics
  powerUpType?: PowerUpType;
  activeEffects?: ActiveEffect[]; // For player
}

export interface GameState {
  player: Entity;
  entities: Entity[];
  particles: Entity[];
  projectiles: Entity[];
  score: number;
  wave: number;
  arenaRadius: number;
  camera: Vector2;
  gameOver: boolean;
  paused: boolean;
  lastTime: number;
  events: GameEventType[];
  globalTimeScale: number; // 1.0 = normal, <1.0 = slow motion
}