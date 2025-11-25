import { Entity, EntityType, GameState, Vector2, GameEventType } from '../types';
import { 
  add, sub, mult, normalize, dist, angleBetween, mag, clampPosition, randomRange, normalizeAngle 
} from '../utils/math';
import { 
  FRICTION, PLAYER_ACCEL, PLAYER_MAX_SPEED, PLAYER_ROTATION_SPEED, 
  PROJECTILE_SPEED, PROJECTILE_LIFETIME, ARENA_RADIUS 
} from '../constants';

// --- Generators ---

export const createPlayer = (): Entity => ({
  id: 'player',
  type: EntityType.PLAYER,
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  rotation: -Math.PI / 2,
  radius: 15,
  health: 100,
  maxHealth: 100,
  shield: 100,
  maxShield: 100,
  color: '#00ffcc',
  isDead: false,
  cooldown: 0,
  maxCooldown: 10,
  thrusting: false,
});

export const createAsteroid = (x: number, y: number, size: 'small' | 'medium' | 'large'): Entity => {
  let radius = 20;
  if (size === 'medium') radius = 40;
  if (size === 'large') radius = 70;
  
  return {
    id: `ast-${Math.random()}`,
    type: EntityType.ASTEROID,
    position: { x, y },
    velocity: { x: randomRange(-0.5, 0.5), y: randomRange(-0.5, 0.5) },
    rotation: randomRange(0, Math.PI * 2),
    radius,
    health: radius * 2,
    maxHealth: radius * 2,
    color: '#666',
    isDead: false,
    cooldown: 0,
    maxCooldown: 0,
    thrusting: false,
  };
};

export const createMine = (position: Vector2): Entity => ({
  id: `mine-${Math.random()}`,
  type: EntityType.MINE,
  position,
  velocity: { x: 0, y: 0 },
  rotation: randomRange(0, Math.PI * 2),
  radius: 10,
  health: 10,
  maxHealth: 10,
  color: '#ff3333',
  isDead: false,
  cooldown: 0,
  maxCooldown: 0,
  thrusting: false,
  lifetime: 1000, // Disappear eventually
  scoreValue: 20,
});

export const createEnemy = (type: EntityType, playerPos: Vector2): Entity => {
  // Spawn far away from player
  let pos: Vector2;
  let attempts = 0;
  // Safety break to prevent infinite loops if arena is crowded
  do {
    pos = { x: randomRange(-ARENA_RADIUS, ARENA_RADIUS), y: randomRange(-ARENA_RADIUS, ARENA_RADIUS) };
    attempts++;
  } while ((dist(pos, playerPos) < 600 || dist(pos, {x:0,y:0}) > ARENA_RADIUS) && attempts < 50);

  // Fallback if no valid spot found
  if (attempts >= 50) {
      const angle = randomRange(0, Math.PI * 2);
      pos = { x: Math.cos(angle) * (ARENA_RADIUS - 50), y: Math.sin(angle) * (ARENA_RADIUS - 50) };
  }

  let radius = 20;
  let health = 30;
  let color = '#fff';
  let maxCooldown = 30;
  let scoreValue = 100;

  switch (type) {
    case EntityType.ENEMY_SCOUT:
      radius = 15;
      health = 30;
      color = '#ff0055';
      maxCooldown = 30;
      scoreValue = 100;
      break;
    case EntityType.ENEMY_CRUISER:
      radius = 25;
      health = 100;
      color = '#ff9900';
      maxCooldown = 60;
      scoreValue = 300;
      break;
    case EntityType.ENEMY_INTERCEPTOR:
      radius = 12;
      health = 40;
      color = '#fff200';
      maxCooldown = 15; // Fast fire
      scoreValue = 200;
      break;
    case EntityType.ENEMY_BOMBER:
      radius = 35;
      health = 150;
      color = '#d000ff';
      maxCooldown = 150; // Mine drop rate
      scoreValue = 500;
      break;
    default:
      break;
  }

  return {
    id: `enemy-${Math.random()}`,
    type,
    position: pos,
    velocity: { x: 0, y: 0 },
    rotation: 0,
    radius,
    health,
    maxHealth: health,
    color,
    isDead: false,
    cooldown: 0,
    maxCooldown,
    thrusting: false,
    scoreValue,
  };
};

export const createProjectile = (owner: Entity, offsetAngle: number = 0): Entity => {
  const angle = owner.rotation + offsetAngle;
  const velocity = add(owner.velocity, mult({ x: Math.cos(angle), y: Math.sin(angle) }, PROJECTILE_SPEED));
  // Spawn slightly in front
  const position = add(owner.position, mult({ x: Math.cos(angle), y: Math.sin(angle) }, owner.radius + 5));

  return {
    id: `proj-${Math.random()}`,
    type: EntityType.PROJECTILE,
    position,
    velocity,
    rotation: angle,
    radius: 3,
    health: 1,
    maxHealth: 1,
    color: owner.type === EntityType.PLAYER ? '#ccff00' : '#ff0000',
    isDead: false,
    cooldown: 0,
    maxCooldown: 0,
    thrusting: false,
    lifetime: PROJECTILE_LIFETIME,
  };
};

export const createParticle = (pos: Vector2, color: string, speed: number = 2): Entity => ({
  id: `part-${Math.random()}`,
  type: EntityType.PARTICLE,
  position: pos,
  velocity: { 
    x: randomRange(-speed, speed), 
    y: randomRange(-speed, speed) 
  },
  rotation: randomRange(0, Math.PI * 2),
  radius: randomRange(1, 3),
  health: 1,
  maxHealth: 1,
  color,
  isDead: false,
  cooldown: 0,
  maxCooldown: 0,
  thrusting: false,
  lifetime: randomRange(20, 50),
});

// --- Logic ---

const updateEntityPhysics = (entity: Entity) => {
  // Apply velocity
  entity.position = add(entity.position, entity.velocity);
  
  // Normalize rotation to prevent indefinite growth (prevents floating point precision issues and loop freezes)
  entity.rotation = normalizeAngle(entity.rotation);

  // Friction
  if (entity.type !== EntityType.PROJECTILE && entity.type !== EntityType.MINE) {
    entity.velocity = mult(entity.velocity, FRICTION);
  } else if (entity.type === EntityType.MINE) {
    entity.velocity = mult(entity.velocity, 0.95); // Higher friction for mines
  }

  // Bounds checking (Circular Arena)
  if (entity.type !== EntityType.PARTICLE) {
    const d = dist(entity.position, {x:0, y:0});
    if (d + entity.radius > ARENA_RADIUS) {
      // Bounce back
      const normal = normalize(mult(entity.position, -1)); // Point towards center
      const bounceForce = 0.5;
      entity.velocity = add(entity.velocity, mult(normal, bounceForce));
      entity.position = clampPosition(entity.position, ARENA_RADIUS - entity.radius);
    }
  }

  // Lifetime
  if (entity.lifetime !== undefined) {
    entity.lifetime--;
    if (entity.lifetime <= 0) entity.isDead = true;
  }
};

// --- AI Systems ---

const updatePlayerAI = (player: Entity, state: GameState) => {
  if (player.isDead) return;

  // 1. Find nearest active threat (Enemy or Mine)
  let nearestThreat: Entity | null = null;
  let minDist = Infinity;
  
  state.entities.forEach(e => {
    const isEnemy = [
        EntityType.ENEMY_SCOUT, 
        EntityType.ENEMY_CRUISER, 
        EntityType.ENEMY_INTERCEPTOR, 
        EntityType.ENEMY_BOMBER,
        EntityType.MINE
    ].includes(e.type);

    if (isEnemy) {
      const d = dist(player.position, e.position);
      if (d < minDist) {
        minDist = d;
        nearestThreat = e;
      }
    }
  });

  // 2. Navigation
  if (nearestThreat) {
    const angleToEnemy = angleBetween(player.position, nearestThreat.position);
    // Use normalizeAngle for diff calculation to avoid loop freezing
    const diff = normalizeAngle(angleToEnemy - player.rotation);
    
    // Turn
    if (Math.abs(diff) > 0.1) {
      player.rotation += Math.sign(diff) * PLAYER_ROTATION_SPEED;
    } else {
      player.rotation = angleToEnemy;
    }

    // Thrust control
    const distance = dist(player.position, nearestThreat.position);
    
    // Heuristic: If far, boost. If close, maintain distance.
    const idealDistance = 300;
    
    if (distance > idealDistance) {
      // Accelerate towards
      const accel = { x: Math.cos(player.rotation) * PLAYER_ACCEL, y: Math.sin(player.rotation) * PLAYER_ACCEL };
      player.velocity = add(player.velocity, accel);
      player.thrusting = true;
    } else if (distance < 150) {
      // Back off
      const accel = { x: Math.cos(player.rotation) * PLAYER_ACCEL * 0.5, y: Math.sin(player.rotation) * PLAYER_ACCEL * 0.5 };
      player.velocity = sub(player.velocity, accel);
      player.thrusting = true;
    } else {
      player.thrusting = false;
    }

    // Shoot
    if (Math.abs(diff) < 0.2 && distance < 700 && player.cooldown <= 0) {
      state.projectiles.push(createProjectile(player));
      state.events.push(GameEventType.PLAYER_SHOOT);
      player.cooldown = player.maxCooldown;
    }

  } else {
    // Idle / Patrol mode: Fly to center if nothing else
    const angleToCenter = angleBetween(player.position, {x:0, y:0});
    // Use normalizeAngle here as well
    const diff = normalizeAngle(angleToCenter - player.rotation);

    if (Math.abs(diff) > 0.1) {
      player.rotation += Math.sign(diff) * PLAYER_ROTATION_SPEED;
    }

    if (dist(player.position, {x:0, y:0}) > 200) {
       const accel = { x: Math.cos(player.rotation) * PLAYER_ACCEL * 0.5, y: Math.sin(player.rotation) * PLAYER_ACCEL * 0.5 };
       player.velocity = add(player.velocity, accel);
       player.thrusting = true;
    } else {
       player.rotation += 0.02; // Scan
       player.thrusting = false;
    }
  }

  // 3. Obstacle Avoidance (Raycast simulation)
  // Check for asteroids ahead
  const lookAhead = add(player.position, mult(normalize(player.velocity), 150));
  state.entities.forEach(e => {
    if (e.type === EntityType.ASTEROID || e.type === EntityType.MINE) {
      if (dist(lookAhead, e.position) < e.radius + 60) {
         // Force turn away
         const angleToObstacle = angleBetween(player.position, e.position);
         const evadeAngle = angleToObstacle + Math.PI / 2;
         const evadeForce = 0.8;
         player.velocity = add(player.velocity, { x: Math.cos(evadeAngle) * evadeForce, y: Math.sin(evadeAngle) * evadeForce });
      }
    }
  });

  // Clamp Speed
  const speed = mag(player.velocity);
  if (speed > PLAYER_MAX_SPEED) {
    player.velocity = mult(normalize(player.velocity), PLAYER_MAX_SPEED);
  }

  // Cooldown
  if (player.cooldown > 0) player.cooldown--;
  
  // Shield regen
  if (player.shield !== undefined && player.maxShield !== undefined && player.shield < player.maxShield && state.lastTime % 10 === 0) {
    player.shield += 0.1;
  }
};

const updateEnemyAI = (enemy: Entity, state: GameState) => {
   if (enemy.isDead) return;
   
   const player = state.player;
   // Even if player is dead, enemies might still move or patrol, but for now let's just let them drift if player is dead
   if (player.isDead) return;

   const d = dist(enemy.position, player.position);
   const angleToPlayer = angleBetween(enemy.position, player.position);
   
   // Normalize angle diff using math instead of loops
   const diff = normalizeAngle(angleToPlayer - enemy.rotation);

   // Common Rotation Logic (turn towards player mostly)
   const turnSpeed = enemy.type === EntityType.ENEMY_INTERCEPTOR ? 0.08 : 0.04;
   enemy.rotation += Math.sign(diff) * turnSpeed;

   if (enemy.type === EntityType.ENEMY_SCOUT) {
       // --- SCOUT: Simple Chase ---
       const speed = 3;
       if (d > 200) {
           const accel = { x: Math.cos(enemy.rotation) * 0.2, y: Math.sin(enemy.rotation) * 0.2 };
           enemy.velocity = add(enemy.velocity, accel);
       }
       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       if (d < 500 && Math.abs(diff) < 0.5 && enemy.cooldown <= 0) {
           state.projectiles.push(createProjectile(enemy));
           state.events.push(GameEventType.ENEMY_SHOOT);
           enemy.cooldown = enemy.maxCooldown;
       }

   } else if (enemy.type === EntityType.ENEMY_CRUISER) {
       // --- CRUISER: Keep Distance & Spread Shot ---
       const speed = 1.5;
       const desiredDist = 500;
       
       const accelVal = 0.15;
       if (d > desiredDist) {
           // Move closer
           const accel = { x: Math.cos(enemy.rotation) * accelVal, y: Math.sin(enemy.rotation) * accelVal };
           enemy.velocity = add(enemy.velocity, accel);
       } else if (d < desiredDist - 100) {
           // Back up
            const accel = { x: Math.cos(enemy.rotation) * accelVal, y: Math.sin(enemy.rotation) * accelVal };
            enemy.velocity = sub(enemy.velocity, accel);
       }

       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       if (d < 800 && Math.abs(diff) < 0.5 && enemy.cooldown <= 0) {
           state.projectiles.push(createProjectile(enemy));
           state.projectiles.push(createProjectile(enemy, 0.2));
           state.projectiles.push(createProjectile(enemy, -0.2));
           state.events.push(GameEventType.ENEMY_SHOOT);
           enemy.cooldown = enemy.maxCooldown;
       }

   } else if (enemy.type === EntityType.ENEMY_INTERCEPTOR) {
       // --- INTERCEPTOR: Aggressive Hit & Run ---
       const speed = 6;
       // If far, charge. If close, break away.
       
       if (d > 300) {
           // Charge
           const accel = { x: Math.cos(enemy.rotation) * 0.5, y: Math.sin(enemy.rotation) * 0.5 };
           enemy.velocity = add(enemy.velocity, accel);
       } else {
           // Break away laterally
           const sideAngle = enemy.rotation + Math.PI / 2;
           const accel = { x: Math.cos(sideAngle) * 0.6, y: Math.sin(sideAngle) * 0.6 };
           enemy.velocity = add(enemy.velocity, accel);
       }

       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       // Rapid fire when lined up
       if (d < 600 && Math.abs(diff) < 0.2 && enemy.cooldown <= 0) {
           state.projectiles.push(createProjectile(enemy));
           state.events.push(GameEventType.ENEMY_SHOOT);
           enemy.cooldown = enemy.maxCooldown; // Low cooldown defined in createEnemy
       }

   } else if (enemy.type === EntityType.ENEMY_BOMBER) {
       // --- BOMBER: Slow, drops Mines ---
       const speed = 1;
       const desiredDist = 400;

       if (d > desiredDist) {
         const accel = { x: Math.cos(enemy.rotation) * 0.05, y: Math.sin(enemy.rotation) * 0.05 };
         enemy.velocity = add(enemy.velocity, accel);
       }

       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       // Drop Mine
       if (d < 800 && enemy.cooldown <= 0) {
           state.entities.push(createMine(sub(enemy.position, mult(normalize(enemy.velocity), 30))));
           enemy.cooldown = enemy.maxCooldown;
       }
   }

   if (enemy.cooldown > 0) enemy.cooldown--;
};

const checkCollisions = (state: GameState) => {
  // Projectile vs Entity
  state.projectiles.forEach(p => {
    if (p.isDead) return;

    // Check vs Player
    if (p.color !== state.player.color && !state.player.isDead) { // Enemy projectile
      if (dist(p.position, state.player.position) < state.player.radius + p.radius) {
        p.isDead = true;
        state.events.push(GameEventType.IMPACT);
        // Shield absorb
        if (state.player.shield && state.player.shield > 0) {
          state.player.shield -= 10;
          for(let i=0; i<5; i++) state.particles.push(createParticle(p.position, '#00ffcc'));
        } else {
          state.player.health -= 10;
          for(let i=0; i<10; i++) state.particles.push(createParticle(p.position, '#ff0000'));
        }
      }
    }

    // Check vs Enemies/Asteroids/Mines
    state.entities.forEach(e => {
      if (e.isDead || p.isDead) return;
      const isPlayerProj = p.color === '#ccff00';
      
      // Enemies/Mines hit by player proj
      // Asteroids hit by anything
      const isTarget = (e.type !== EntityType.ASTEROID && isPlayerProj) || e.type === EntityType.ASTEROID || e.type === EntityType.MINE;

      if (isTarget) {
           if (dist(p.position, e.position) < e.radius + p.radius) {
              p.isDead = true;
              e.health -= 10;
              state.events.push(GameEventType.IMPACT);
              for(let i=0; i<3; i++) state.particles.push(createParticle(p.position, '#ffff00'));
              
              if (e.health <= 0) {
                e.isDead = true;
                if (e.scoreValue) state.score += e.scoreValue;
                state.events.push(GameEventType.EXPLOSION);
                
                // Explosion color
                let boomColor = e.color;
                if (e.type === EntityType.MINE) boomColor = '#ffaa00';
                
                // Big Explosion
                for(let i=0; i<15; i++) state.particles.push(createParticle(e.position, boomColor, 4));
                
                // Mines explode dealing Area Damage when destroyed
                if (e.type === EntityType.MINE) {
                     // Check player distance
                     if (dist(e.position, state.player.position) < 100) {
                         state.player.health -= 20;
                         state.events.push(GameEventType.IMPACT);
                     }
                }
              }
           }
      }
    });
  });

  // Entity vs Entity (Collision/Push)
  state.entities.forEach(e => {
    if (e.isDead) return;

    // Player Collisions
    const d = dist(state.player.position, e.position);
    const minDist = state.player.radius + e.radius;
    
    if (d < minDist) {
      // Bounce
      const angle = angleBetween(e.position, state.player.position);
      const force = 5;
      
      // Only push player if they aren't dead
      if (!state.player.isDead) {
          state.player.velocity = add(state.player.velocity, { x: Math.cos(angle) * force, y: Math.sin(angle) * force });
      }
      
      let damage = 5;
      if (e.type === EntityType.MINE) {
          damage = 40; // Mines hurt a lot
          e.isDead = true; // Mine explodes
          state.events.push(GameEventType.EXPLOSION);
          for(let i=0; i<20; i++) state.particles.push(createParticle(e.position, '#ff5500', 5));
      }

      // Damage application
      if (!state.player.isDead) {
          state.player.shield = Math.max(0, (state.player.shield || 0) - damage);
          if (state.player.shield <= 0) {
              state.player.health -= (damage > 10 ? damage / 2 : 0);
          }
      }
    }
  });
};

export const updateGame = (state: GameState) => {
  if (state.paused) return;

  state.lastTime++;

  // Always process Particles/Projectiles/Physics for "Drift" effect even if Game Over
  
  // Update Player AI (Only if alive)
  if (!state.player.isDead && !state.gameOver) {
    updatePlayerAI(state.player, state);
    
    if (state.player.health <= 0) {
        state.gameOver = true;
        state.player.isDead = true;
        state.player.thrusting = false;
        state.events.push(GameEventType.EXPLOSION);
        state.events.push(GameEventType.GAME_OVER);
        // Spawn death particles
        for(let i=0; i<30; i++) state.particles.push(createParticle(state.player.position, '#00ffcc', 6));
    }
  }
  
  // Update Entity Physics (Always, for drift)
  updateEntityPhysics(state.player);

  // Update AI for Enemies (Only if game running)
  if (!state.gameOver) {
      state.entities.forEach(e => {
        if ([EntityType.ENEMY_SCOUT, EntityType.ENEMY_CRUISER, EntityType.ENEMY_INTERCEPTOR, EntityType.ENEMY_BOMBER].includes(e.type)) {
          updateEnemyAI(e, state);
        }
        // Asteroid rotation
        if (e.type === EntityType.ASTEROID || e.type === EntityType.MINE) {
          e.rotation += e.type === EntityType.MINE ? 0.05 : 0.01;
        }
        updateEntityPhysics(e);
      });

      // Spawn waves logic
      const livingEnemies = state.entities.filter(e => 
        [EntityType.ENEMY_SCOUT, EntityType.ENEMY_CRUISER, EntityType.ENEMY_INTERCEPTOR, EntityType.ENEMY_BOMBER].includes(e.type)
      ).length;
      
      const maxEnemies = 2 + state.wave;

      if (livingEnemies < maxEnemies && state.lastTime % 100 === 0) {
        let availableTypes = [EntityType.ENEMY_SCOUT];
        if (state.wave >= 2) availableTypes.push(EntityType.ENEMY_CRUISER);
        if (state.wave >= 3) availableTypes.push(EntityType.ENEMY_INTERCEPTOR);
        if (state.wave >= 4) availableTypes.push(EntityType.ENEMY_BOMBER);
        if (Math.random() > 0.9 && state.wave < 3) availableTypes.push(EntityType.ENEMY_INTERCEPTOR);

        const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        state.entities.push(createEnemy(type, state.player.position));
      }
      
      if (state.score > state.wave * 1500) {
        state.wave++;
      }
  } else {
      // Game Over Drift: Just update physics for existing entities so they don't freeze
      state.entities.forEach(e => updateEntityPhysics(e));
  }

  // Update Projectiles (Always)
  state.projectiles.forEach(p => updateEntityPhysics(p));

  // Update Particles (Always)
  state.particles.forEach(p => updateEntityPhysics(p));

  if (!state.gameOver) {
      checkCollisions(state);
  }

  // Cleanup dead
  state.entities = state.entities.filter(e => !e.isDead);
  state.projectiles = state.projectiles.filter(p => !p.isDead);
  state.particles = state.particles.filter(p => !p.isDead);
};