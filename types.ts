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

export enum GameEventType {
  PLAYER_SHOOT = 'PLAYER_SHOOT',
  ENEMY_SHOOT = 'ENEMY_SHOOT',
  EXPLOSION = 'EXPLOSION',
  IMPACT = 'IMPACT',
  GAME_OVER = 'GAME_OVER'
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
}