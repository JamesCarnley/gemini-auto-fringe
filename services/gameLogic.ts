
import { Entity, EntityType, GameState, Vector2, GameEventType, PowerUpType, ActiveEffect } from '../types';
import { 
  add, sub, mult, normalize, dist, angleBetween, mag, clampPosition, randomRange, normalizeAngle, predictTargetPosition, dot, limit, div 
} from '../utils/math';
import { 
  FRICTION, PLAYER_ACCEL, PLAYER_MAX_SPEED, PLAYER_ROTATION_SPEED, 
  PROJECTILE_SPEED, PROJECTILE_LIFETIME, ARENA_RADIUS, POWERUP_COLORS, POWERUP_DURATIONS
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
  activeEffects: [],
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

export const createPowerUp = (position: Vector2): Entity => {
  // Weighted Random
  const rand = Math.random();
  let type = PowerUpType.HEALTH_PACK;
  
  if (rand < 0.30) type = PowerUpType.HEALTH_PACK;
  else if (rand < 0.55) type = PowerUpType.SHIELD_OVERCHARGE;
  else if (rand < 0.75) type = PowerUpType.RAPID_FIRE;
  else if (rand < 0.90) type = PowerUpType.SCATTER_SHOT;
  else if (rand < 0.98) type = PowerUpType.TIME_WARP;
  else type = PowerUpType.OMEGA_BLAST;

  return {
    id: `pup-${Math.random()}`,
    type: EntityType.POWERUP,
    position,
    velocity: { x: randomRange(-0.5, 0.5), y: randomRange(-0.5, 0.5) },
    rotation: 0,
    radius: 15,
    health: 1,
    maxHealth: 1,
    color: POWERUP_COLORS[type] || '#fff',
    isDead: false,
    cooldown: 0,
    maxCooldown: 0,
    thrusting: false,
    powerUpType: type,
    lifetime: 1800, // 30 seconds before despawn
  };
};

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

const updateEntityPhysics = (entity: Entity, timeScale: number = 1) => {
  // Apply velocity (scaled if not player/player_proj)
  const effectiveScale = (entity.type === EntityType.PLAYER || (entity.type === EntityType.PROJECTILE && entity.color === '#ccff00')) ? 1 : timeScale;
  
  entity.position = add(entity.position, mult(entity.velocity, effectiveScale));
  
  // Normalize rotation
  entity.rotation = normalizeAngle(entity.rotation);

  // Friction
  if (entity.type !== EntityType.PROJECTILE && entity.type !== EntityType.MINE && entity.type !== EntityType.POWERUP) {
    entity.velocity = mult(entity.velocity, FRICTION);
  } else if (entity.type === EntityType.MINE) {
    entity.velocity = mult(entity.velocity, 0.95); 
  } else if (entity.type === EntityType.POWERUP) {
    entity.velocity = mult(entity.velocity, 0.90); // Slow down drift
  }

  // Bounds checking
  if (entity.type !== EntityType.PARTICLE) {
    const d = dist(entity.position, {x:0, y:0});
    if (d + entity.radius > ARENA_RADIUS) {
      const normal = normalize(mult(entity.position, -1));
      const bounceForce = 0.5;
      entity.velocity = add(entity.velocity, mult(normal, bounceForce));
      entity.position = clampPosition(entity.position, ARENA_RADIUS - entity.radius);
    }
  }

  // Lifetime
  if (entity.lifetime !== undefined) {
    // Projectiles also slowed down by time warp if they are enemy projectiles
    const lifeDecay = (entity.type === EntityType.PROJECTILE && entity.color !== '#ccff00') ? effectiveScale : 1;
    
    entity.lifetime -= lifeDecay;
    if (entity.lifetime <= 0) entity.isDead = true;
  }
};

// --- AI Systems ---

const updatePlayerAI = (player: Entity, state: GameState) => {
  if (player.isDead) return;

  // 1. Manage Active Effects & Time Scale
  if (player.activeEffects) {
      player.activeEffects.forEach(eff => eff.duration--);
      player.activeEffects = player.activeEffects.filter(eff => eff.duration > 0);
      
      const timeWarp = player.activeEffects.find(e => e.type === PowerUpType.TIME_WARP);
      state.globalTimeScale = timeWarp ? 0.2 : 1.0;
  }

  // 2. Scan Environment
  const enemies = state.entities.filter(e => 
    [EntityType.ENEMY_SCOUT, EntityType.ENEMY_CRUISER, EntityType.ENEMY_INTERCEPTOR, EntityType.ENEMY_BOMBER, EntityType.MINE].includes(e.type)
  );
  const powerups = state.entities.filter(e => e.type === EntityType.POWERUP);
  const enemyProjectiles = state.projectiles.filter(p => p.color !== '#ccff00');

  let closestEnemy: Entity | null = null;
  let minDist = Infinity;
  enemies.forEach(e => {
    const d = dist(player.position, e.position);
    if (d < minDist) {
      minDist = d;
      closestEnemy = e;
    }
  });

  // --- STEERING FORCES (Weighted Vector Sum) ---
  let acc = { x: 0, y: 0 };
  
  // A. Evasion Force (Highest Priority)
  // Dodge projectiles that are heading towards us
  let evadeForce = { x: 0, y: 0 };
  let threats = 0;
  enemyProjectiles.forEach(p => {
    const d = dist(player.position, p.position);
    if (d < 300) { // Scan radius
      const toPlayer = sub(player.position, p.position);
      // Check if projectile is actually moving towards player
      if (dot(normalize(p.velocity), normalize(toPlayer)) > 0.4) {
        // Calculate perpendicular dodge vector
        const angle = Math.atan2(toPlayer.y, toPlayer.x);
        // Vary dodge direction based on projectile id hash to prevent oscillating
        const dir = (p.id.charCodeAt(p.id.length-1) % 2 === 0) ? 1 : -1;
        const dodgeVec = { x: Math.cos(angle + dir * Math.PI/2), y: Math.sin(angle + dir * Math.PI/2) };
        // Weight by proximity
        const urgency = (300 - d) / 300; 
        evadeForce = add(evadeForce, mult(dodgeVec, urgency * 3.0)); 
        threats++;
      }
    }
  });

  // B. PowerUp Seek Force (Greedy)
  let seekPowerForce = { x: 0, y: 0 };
  let closestPowerup: Entity | null = null;
  let powerDist = Infinity;
  powerups.forEach(p => {
    const d = dist(player.position, p.position);
    if (d < powerDist) {
      powerDist = d;
      closestPowerup = p;
    }
  });

  if (closestPowerup) {
    const desired = sub(closestPowerup.position, player.position);
    // Increased weight if safe or damaged
    const weight = (player.health < 60 || threats === 0 || closestPowerup.powerUpType === PowerUpType.OMEGA_BLAST) ? 3.0 : 1.5;
    seekPowerForce = mult(normalize(desired), weight);
  }

  // C. Combat Position Force with Dynamic Range (Oscillator)
  let combatForce = { x: 0, y: 0 };
  if (closestEnemy) {
    const distToEnemy = dist(player.position, closestEnemy.position);
    // "Breathing" range: oscillates between 150 and 450 to break static strafing loops
    const dynamicRange = 300 + Math.sin(state.lastTime * 0.03) * 150;
    
    const toEnemy = sub(closestEnemy.position, player.position);
    
    if (distToEnemy < dynamicRange) {
      // Back away
      combatForce = mult(normalize(toEnemy), -1.2); 
    } else {
      // Close distance
      combatForce = mult(normalize(toEnemy), 1.0);
    }
  }

  // D. Arena Bounds Force (Stay inside)
  let boundsForce = { x: 0, y: 0 };
  const distFromCenter = dist(player.position, {x:0, y:0});
  if (distFromCenter > ARENA_RADIUS - 300) {
    const toCenter = mult(normalize(player.position), -1);
    const urgency = (distFromCenter - (ARENA_RADIUS - 300)) / 300;
    boundsForce = mult(toCenter, urgency * 4.0);
  }

  // --- Combine Forces ---
  // If dodging, ignore combat positioning to survive
  if (threats > 0) {
    acc = add(acc, evadeForce);
    acc = add(acc, boundsForce); // Still respect bounds
    if (closestPowerup && player.health < 40) acc = add(acc, seekPowerForce); // Desperate heal
  } else {
    // Normal behavior
    acc = add(acc, combatForce);
    acc = add(acc, seekPowerForce);
    acc = add(acc, boundsForce);
  }

  // Limit acceleration and apply
  acc = limit(acc, PLAYER_ACCEL);
  if (mag(acc) > 0.05) {
    player.velocity = add(player.velocity, acc);
    player.thrusting = true;
  } else {
    player.thrusting = false;
  }
  
  // Cap Speed
  if (mag(player.velocity) > PLAYER_MAX_SPEED) {
    player.velocity = mult(normalize(player.velocity), PLAYER_MAX_SPEED);
  }

  // --- Aiming Logic (Independent of Movement) ---
  if (closestEnemy) {
     const targetEffectiveVel = mult(closestEnemy.velocity, state.globalTimeScale);
     const predictedPos = predictTargetPosition(player.position, closestEnemy.position, targetEffectiveVel, PROJECTILE_SPEED);
     
     // Velocity Compensation: Adjust aim to account for player's own sideways motion (Strafing fix)
     const toPredicted = sub(predictedPos, player.position);
     const idealBulletVel = mult(normalize(toPredicted), PROJECTILE_SPEED);
     // If we aim at 'idealBulletVel', our actual bullet vel will be 'idealBulletVel + playerVel'.
     // We want the RESULT to be towards the target. 
     // Approximation: subtract player velocity from the ideal vector to find where to point the nose.
     const compensatedDir = sub(idealBulletVel, mult(player.velocity, 0.8)); // 0.8 factor to avoid over-correction
     
     const angleToTarget = Math.atan2(compensatedDir.y, compensatedDir.x);
     const diff = normalizeAngle(angleToTarget - player.rotation);

     // Smooth aim
     if (Math.abs(diff) > 0.05) {
       player.rotation += Math.sign(diff) * PLAYER_ROTATION_SPEED;
     } else {
       player.rotation = angleToTarget;
     }

     // Fire Control
     const hasRapidFire = player.activeEffects?.some(e => e.type === PowerUpType.RAPID_FIRE);
     const hasScatter = player.activeEffects?.some(e => e.type === PowerUpType.SCATTER_SHOT);
     // Wider tolerance when compensated aiming is active
     const aimTol = hasScatter ? 0.5 : 0.2; 
     const range = 900;

     if (Math.abs(diff) < aimTol && dist(player.position, closestEnemy.position) < range && player.cooldown <= 0) {
        state.projectiles.push(createProjectile(player));
        
        if (hasScatter) {
           state.projectiles.push(createProjectile(player, 0.15));
           state.projectiles.push(createProjectile(player, -0.15));
           state.projectiles.push(createProjectile(player, 0.3));
           state.projectiles.push(createProjectile(player, -0.3));
        }

        state.events.push(GameEventType.PLAYER_SHOOT);
        player.cooldown = hasRapidFire ? player.maxCooldown / 4 : player.maxCooldown;
     }
  } else {
     // Idle rotation if no enemies
     const velAngle = Math.atan2(player.velocity.y, player.velocity.x);
     if (mag(player.velocity) > 0.5) {
         const diff = normalizeAngle(velAngle - player.rotation);
         if (Math.abs(diff) > 0.1) player.rotation += Math.sign(diff) * 0.05;
     }
  }

  // Cooldown tick
  if (player.cooldown > 0) player.cooldown--;

  // Passive Shield regen
  if (player.shield !== undefined && player.maxShield !== undefined && player.shield < player.maxShield && state.lastTime % 10 === 0) {
    player.shield += 0.1;
  }
};

const updateEnemyAI = (enemy: Entity, state: GameState) => {
   if (enemy.isDead) return;
   const player = state.player;
   if (player.isDead) return;

   // All enemy actions are scaled by globalTimeScale
   // Physics handles velocity, but we need to handle rotation and cooldown scaling manually
   
   const d = dist(enemy.position, player.position);
   let targetPos = player.position;

   if (enemy.type === EntityType.ENEMY_INTERCEPTOR || enemy.type === EntityType.ENEMY_CRUISER) {
      targetPos = predictTargetPosition(enemy.position, player.position, player.velocity, PROJECTILE_SPEED);
   }

   const angleToTarget = angleBetween(enemy.position, targetPos);
   const diff = normalizeAngle(angleToTarget - enemy.rotation);

   // Turn speed affected by time warp
   const baseTurnSpeed = enemy.type === EntityType.ENEMY_INTERCEPTOR ? 0.12 : 0.04;
   const turnSpeed = baseTurnSpeed * state.globalTimeScale;
   
   enemy.rotation += Math.sign(diff) * turnSpeed;

   // Thrust/Movement logic adds to velocity, which is then scaled in physics update
   // We just need to make sure we don't add FULL force if time is slow, 
   // actually physics update handles velocity scaling, so 'force' added here should be full?
   // No, if time is slow, they accelerate slower too.
   const timeMod = state.globalTimeScale;

   if (enemy.type === EntityType.ENEMY_SCOUT) {
       const speed = 3;
       if (d > 200) {
           const accel = { x: Math.cos(enemy.rotation) * 0.2 * timeMod, y: Math.sin(enemy.rotation) * 0.2 * timeMod };
           enemy.velocity = add(enemy.velocity, accel);
       }
       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       if (d < 500 && Math.abs(diff) < 0.5 && enemy.cooldown <= 0) {
           state.projectiles.push(createProjectile(enemy));
           state.events.push(GameEventType.ENEMY_SHOOT);
           enemy.cooldown = enemy.maxCooldown;
       }

   } else if (enemy.type === EntityType.ENEMY_CRUISER) {
       const speed = 1.5;
       const desiredDist = 500;
       const accelVal = 0.15 * timeMod;
       
       if (d > desiredDist) {
           const accel = { x: Math.cos(enemy.rotation) * accelVal, y: Math.sin(enemy.rotation) * accelVal };
           enemy.velocity = add(enemy.velocity, accel);
       } else if (d < desiredDist - 100) {
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
       const speed = 6;
       if (d > 300) {
           const accel = { x: Math.cos(enemy.rotation) * 0.5 * timeMod, y: Math.sin(enemy.rotation) * 0.5 * timeMod };
           enemy.velocity = add(enemy.velocity, accel);
       } else {
           const sideAngle = enemy.rotation + Math.PI / 2;
           const accel = { x: Math.cos(sideAngle) * 0.6 * timeMod, y: Math.sin(sideAngle) * 0.6 * timeMod };
           enemy.velocity = add(enemy.velocity, accel);
       }

       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       if (d < 600 && Math.abs(diff) < 0.3 && enemy.cooldown <= 0) {
           state.projectiles.push(createProjectile(enemy));
           state.events.push(GameEventType.ENEMY_SHOOT);
           enemy.cooldown = enemy.maxCooldown; 
       }

   } else if (enemy.type === EntityType.ENEMY_BOMBER) {
       const speed = 1;
       const desiredDist = 400;

       if (d > desiredDist) {
         const accel = { x: Math.cos(enemy.rotation) * 0.05 * timeMod, y: Math.sin(enemy.rotation) * 0.05 * timeMod };
         enemy.velocity = add(enemy.velocity, accel);
       }

       if (mag(enemy.velocity) > speed) enemy.velocity = mult(normalize(enemy.velocity), speed);

       if (d < 800 && enemy.cooldown <= 0) {
           state.entities.push(createMine(sub(enemy.position, mult(normalize(enemy.velocity), 30))));
           enemy.cooldown = enemy.maxCooldown;
       }
   }

   // Cooldown ticks down slower in time warp
   if (enemy.cooldown > 0) enemy.cooldown -= timeMod;
};

const checkCollisions = (state: GameState) => {
  // Projectile vs Entity
  state.projectiles.forEach(p => {
    if (p.isDead) return;

    if (p.color !== state.player.color && !state.player.isDead) { 
      if (dist(p.position, state.player.position) < state.player.radius + p.radius) {
        p.isDead = true;
        state.events.push(GameEventType.IMPACT);
        if (state.player.shield && state.player.shield > 0) {
          state.player.shield -= 10;
          for(let i=0; i<5; i++) state.particles.push(createParticle(p.position, '#00ffcc'));
        } else {
          state.player.health -= 10;
          for(let i=0; i<10; i++) state.particles.push(createParticle(p.position, '#ff0000'));
        }
      }
    }

    state.entities.forEach(e => {
      if (e.isDead || p.isDead) return;
      if (e.type === EntityType.POWERUP) return; // Don't shoot powerups

      const isPlayerProj = p.color === '#ccff00';
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
                
                let boomColor = e.color;
                if (e.type === EntityType.MINE) boomColor = '#ffaa00';
                for(let i=0; i<15; i++) state.particles.push(createParticle(e.position, boomColor, 4));
                
                if (e.type === EntityType.MINE) {
                     if (dist(e.position, state.player.position) < 100) {
                         state.player.health -= 20;
                         state.events.push(GameEventType.IMPACT);
                     }
                }

                // CHANCE TO DROP POWERUP (15%)
                // Only from enemies, not asteroids/mines
                if ([EntityType.ENEMY_SCOUT, EntityType.ENEMY_CRUISER, EntityType.ENEMY_INTERCEPTOR, EntityType.ENEMY_BOMBER].includes(e.type)) {
                    if (Math.random() < 0.15) {
                        state.entities.push(createPowerUp(e.position));
                    }
                }
              }
           }
      }
    });
  });

  // Entity vs Entity
  state.entities.forEach(e => {
    if (e.isDead) return;

    // Player vs Entity
    const d = dist(state.player.position, e.position);
    const minDist = state.player.radius + e.radius;
    
    if (d < minDist) {
      
      // POWERUP COLLECTION
      if (e.type === EntityType.POWERUP && !state.player.isDead) {
          e.isDead = true;
          state.events.push(GameEventType.POWERUP_COLLECT);
          
          // Apply Effect
          if (e.powerUpType) {
              if (e.powerUpType === PowerUpType.HEALTH_PACK) {
                  state.player.health = Math.min(state.player.maxHealth, state.player.health + 50);
              } 
              else if (e.powerUpType === PowerUpType.SHIELD_OVERCHARGE) {
                  if (state.player.shield !== undefined) {
                      state.player.shield += 100; // Can exceed max
                  }
              }
              else if (e.powerUpType === PowerUpType.OMEGA_BLAST) {
                  // Kill all enemies
                  state.entities.forEach(target => {
                      if ([EntityType.ENEMY_SCOUT, EntityType.ENEMY_CRUISER, EntityType.ENEMY_INTERCEPTOR, EntityType.ENEMY_BOMBER, EntityType.MINE].includes(target.type)) {
                          target.health = 0;
                          target.isDead = true;
                          state.events.push(GameEventType.EXPLOSION);
                          for(let i=0; i<10; i++) state.particles.push(createParticle(target.position, target.color, 5));
                          state.score += (target.scoreValue || 50);
                      }
                  });
                  state.events.push(GameEventType.NUKE_TRIGGERED);
                  // Flash screen? (Handled in Canvas via event)
              }
              else {
                  // Status Effect
                  const duration = POWERUP_DURATIONS[e.powerUpType as keyof typeof POWERUP_DURATIONS] || 600;
                  // Check if already active, if so extend
                  const existing = state.player.activeEffects?.find(eff => eff.type === e.powerUpType);
                  if (existing) {
                      existing.duration = duration;
                  } else {
                      state.player.activeEffects?.push({
                          type: e.powerUpType,
                          duration: duration,
                          maxDuration: duration
                      });
                  }
              }
          }
          return; // Skip collision push for powerups
      }

      // Bounce/Push/Damage for non-powerups
      const angle = angleBetween(e.position, state.player.position);
      const force = 5;
      
      if (!state.player.isDead) {
          state.player.velocity = add(state.player.velocity, { x: Math.cos(angle) * force, y: Math.sin(angle) * force });
      }
      
      let damage = 5;
      if (e.type === EntityType.MINE) {
          damage = 40; 
          e.isDead = true;
          state.events.push(GameEventType.EXPLOSION);
          for(let i=0; i<20; i++) state.particles.push(createParticle(e.position, '#ff5500', 5));
      }

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

  // Ensure default time scale if not set
  if (typeof state.globalTimeScale === 'undefined') state.globalTimeScale = 1.0;

  state.lastTime++;

  if (!state.player.isDead && !state.gameOver) {
    updatePlayerAI(state.player, state);
    
    if (state.player.health <= 0) {
        state.gameOver = true;
        state.player.isDead = true;
        state.player.thrusting = false;
        state.events.push(GameEventType.EXPLOSION);
        state.events.push(GameEventType.GAME_OVER);
        for(let i=0; i<30; i++) state.particles.push(createParticle(state.player.position, '#00ffcc', 6));
    }
  } else {
      // Reset time scale on death
      state.globalTimeScale = 1.0;
  }
  
  updateEntityPhysics(state.player);

  if (!state.gameOver) {
      state.entities.forEach(e => {
        if ([EntityType.ENEMY_SCOUT, EntityType.ENEMY_CRUISER, EntityType.ENEMY_INTERCEPTOR, EntityType.ENEMY_BOMBER].includes(e.type)) {
          updateEnemyAI(e, state);
        }
        if (e.type === EntityType.ASTEROID || e.type === EntityType.MINE) {
          e.rotation += (e.type === EntityType.MINE ? 0.05 : 0.01) * state.globalTimeScale;
        }
        // PowerUp rotation
        if (e.type === EntityType.POWERUP) {
            e.rotation += 0.03;
        }

        updateEntityPhysics(e, state.globalTimeScale);
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
      // Drift physics
      state.entities.forEach(e => updateEntityPhysics(e));
  }

  state.projectiles.forEach(p => updateEntityPhysics(p, state.globalTimeScale));
  state.particles.forEach(p => updateEntityPhysics(p, state.globalTimeScale));

  if (!state.gameOver) {
      checkCollisions(state);
  }

  // Cleanup
  state.entities = state.entities.filter(e => !e.isDead);
  state.projectiles = state.projectiles.filter(p => !p.isDead);
  state.particles = state.particles.filter(p => !p.isDead);
};
