/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { CircuitConnectionDefinition, LuaEntity } from "factorio:runtime"
import { isEmpty } from "../lib"
import {
  circuitConnectionMatches,
  CircuitOrPowerSwitchConnection,
  getDirectionalInfo,
  ProjectCircuitConnection,
} from "./circuit-connection"
import {
  CableAddResult,
  MutableProjectContent,
  ProjectContent,
  ProjectEntityCircuitConnections,
} from "./ProjectContent"
import { ProjectEntity, StageNumber } from "./ProjectEntity"
import wire_connection_id = defines.wire_connection_id
import wire_type = defines.wire_type

export function addPowerSwitchConnections(
  thisEntity: LuaEntity,
  existingConnections: CircuitOrPowerSwitchConnection[],
): void {
  const thisType = thisEntity.type
  if (thisType == "electric-pole") {
    for (const copperConnectionDefinition of thisEntity.copper_connection_definitions) {
      if (copperConnectionDefinition.target_entity.type == "power-switch") {
        existingConnections.push({
          wire: defines.wire_type.copper,
          target_entity: copperConnectionDefinition.target_entity,
          source_circuit_id: copperConnectionDefinition.source_wire_connector,
          target_circuit_id: copperConnectionDefinition.target_wire_connector,
        })
      }
    }
  } else if (thisType == "power-switch") {
    for (const copperConnectionDefinition of thisEntity.copper_connection_definitions) {
      if (copperConnectionDefinition.target_entity.type == "electric-pole") {
        existingConnections.push({
          wire: defines.wire_type.copper,
          target_entity: copperConnectionDefinition.target_entity,
          source_circuit_id: copperConnectionDefinition.source_wire_connector,
          target_circuit_id: copperConnectionDefinition.target_wire_connector,
        })
      }
    }
  }
}

function updateCircuitConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): void {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return
  addPowerSwitchConnections(luaEntity, existingConnections)

  const projectConnections = content.getCircuitConnections(entity)

  const [matchingConnections, extraConnections] = partitionExistingCircuitConnections(
    projectConnections,
    luaEntity,
    existingConnections,
    content,
    stage,
  )
  for (const [extraConnection] of extraConnections) {
    if (extraConnection.wire == wire_type.copper) {
      // workaround for factorio api bug: pole.disconnect(power switch) sometime doesn't work,
      // but switch.disconnect(pole) always does
      if (luaEntity.type == "power-switch") {
        luaEntity.disconnect_neighbour({
          wire: extraConnection.wire,
          target_entity: extraConnection.target_entity,
          source_wire_id: extraConnection.source_circuit_id as defines.wire_connection_id,
          target_wire_id: extraConnection.target_circuit_id as defines.wire_connection_id,
        })
      } else {
        extraConnection.target_entity.disconnect_neighbour({
          wire: extraConnection.wire,
          target_entity: luaEntity,
          source_wire_id: extraConnection.target_circuit_id as defines.wire_connection_id,
          target_wire_id: extraConnection.source_circuit_id as defines.wire_connection_id,
        })
      }
    } else {
      luaEntity.disconnect_neighbour(extraConnection as CircuitConnectionDefinition)
    }
  }

  if (projectConnections) {
    for (const [otherEntity, connections] of projectConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (matchingConnections.has(connection)) continue
        const [, otherId, thisId] = getDirectionalInfo(connection, otherEntity)
        if (connection.wire == wire_type.copper) {
          luaEntity.connect_neighbour({
            wire: connection.wire,
            target_entity: otherLuaEntity,
            source_wire_id: thisId as defines.wire_connection_id,
            target_wire_id: otherId as defines.wire_connection_id,
          })
        } else {
          luaEntity.connect_neighbour({
            wire: connection.wire,
            target_entity: otherLuaEntity,
            source_circuit_id: thisId as defines.circuit_connector_id,
            target_circuit_id: otherId as defines.circuit_connector_id,
          })
        }
      }
    }
  }
}

function updateCableConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): void {
  if (luaEntity.type != "electric-pole") return
  const projectConnections = content.getCableConnections(entity)

  const matching = new LuaSet<ProjectEntity>()
  const existingConnections = (
    luaEntity.neighbours as {
      copper?: LuaEntity[]
    }
  ).copper
  if (existingConnections) {
    for (const otherLuaEntity of existingConnections) {
      if (otherLuaEntity.type == "power-switch") continue // handled by circuit connections
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue
      if (projectConnections && projectConnections.has(otherEntity)) {
        matching.add(otherEntity)
      } else {
        luaEntity.disconnect_neighbour(otherLuaEntity)
      }
    }
  }

  if (projectConnections) {
    for (const otherEntity of projectConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (otherLuaEntity && !matching.has(otherEntity)) {
        luaEntity.connect_neighbour(otherLuaEntity)
      }
    }
  }
}

/**
 * Handles both cable and circuit connections.
 */
function updateWireConnectionsAtStage(content: MutableProjectContent, entity: ProjectEntity, stage: StageNumber): void {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return
  updateCircuitConnections(content, entity, stage, luaEntity)
  updateCableConnections(content, entity, stage, luaEntity)
}

function saveCircuitConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
): LuaMultiReturn<[hasDiff: boolean, additionalEntitiesToUpdate?: ProjectEntity[]]> {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return $multi(false)
  const existingConnections: CircuitOrPowerSwitchConnection[] | nil = luaEntity.circuit_connection_definitions
  if (!existingConnections) return $multi(false)

  addPowerSwitchConnections(luaEntity, existingConnections)

  const projectConnections = content.getCircuitConnections(entity)

  const [matchingConnections, extraConnections] = partitionExistingCircuitConnections(
    projectConnections,
    luaEntity,
    existingConnections,
    content,
    stage,
  )

  let hasDiff = !isEmpty(extraConnections)

  // remove before adding, so don't remove just added connections
  if (projectConnections) {
    for (const [otherEntity, connections] of projectConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (!matchingConnections.has(connection)) {
          content.removeCircuitConnection(connection)
          hasDiff = true
        }
      }
    }
  }

  let additionalEntitiesToUpdate: ProjectEntity[] | nil = nil

  for (const [definition, otherEntity] of extraConnections) {
    // power switches have only one connection per side; replace existing connections to the same side if they exist
    if (definition.wire == defines.wire_type.copper) {
      if (luaEntity.type == "power-switch") {
        removeExistingConnectionsToPowerSwitchSide(content, entity, definition.source_circuit_id as wire_connection_id)
      } else {
        assert(luaEntity.type == "electric-pole")
        if (
          removeExistingConnectionsToPowerSwitchSide(
            content,
            otherEntity,
            definition.target_circuit_id as wire_connection_id,
          )
        ) {
          ;(additionalEntitiesToUpdate ??= []).push(otherEntity)
        }
      }
    }
    content.addCircuitConnection({
      fromEntity: entity,
      toEntity: otherEntity,
      wire: definition.wire,
      fromId: definition.source_circuit_id,
      toId: definition.target_circuit_id,
    })
  }
  return $multi(hasDiff, additionalEntitiesToUpdate)
}

function removeExistingConnectionsToPowerSwitchSide(
  content: MutableProjectContent,
  powerSwitchEntity: ProjectEntity,
  side: defines.wire_connection_id,
): true | nil {
  const connections = content.getCircuitConnections(powerSwitchEntity)
  if (!connections) return
  for (const [, otherConnections] of connections) {
    for (const connection of otherConnections) {
      const [, fromId] = getDirectionalInfo(connection, powerSwitchEntity)
      if (fromId == side) {
        content.removeCircuitConnection(connection)
        return true
      }
    }
  }
}

/**
 * additionalStageForConnections: If provided, the connections will be saved for this stage as well (with lower priority).
 * Used when poles are first placed.
 */
function saveCableConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  additionalStageForConnections: StageNumber | nil,
): LuaMultiReturn<[hasAnyDiff: boolean, maxConnectionsExceeded?: boolean]> {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity || luaEntity.type != "electric-pole") return $multi(false)
  const worldConnections = (
    luaEntity.neighbours as {
      copper?: LuaEntity[]
    }
  ).copper
  const savedConnections = content.getCableConnections(entity)

  const matchingConnections = new LuaSet<ProjectEntity>()
  const newConnections = new LuaSet<ProjectEntity>()

  if (worldConnections) {
    for (const otherLuaEntity of worldConnections) {
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue

      if (otherLuaEntity.type == "power-switch") continue
      if (!savedConnections || !savedConnections.has(otherEntity)) {
        newConnections.add(otherEntity)
      } else {
        matchingConnections.add(otherEntity)
      }
    }
  }

  if (additionalStageForConnections) {
    // only add connections to entities higher than this stage
    const higherEntity = entity.getWorldEntity(additionalStageForConnections)
    if (higherEntity) {
      const higherConnections = (
        higherEntity.neighbours as {
          copper?: LuaEntity[]
        }
      ).copper
      if (higherConnections) {
        for (const otherLuaEntity of higherConnections) {
          if (otherLuaEntity.type == "power-switch") continue // don't care about power switches for additional stage
          const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
          if (
            otherEntity &&
            otherEntity.firstStage > stage &&
            !(savedConnections && savedConnections.has(otherEntity))
          ) {
            newConnections.add(otherEntity)
          }
        }
      }
    }
  }

  let hasDiff = !isEmpty(newConnections)
  // remove first, to not exceed max connections
  if (savedConnections) {
    for (const otherEntity of savedConnections) {
      // only remove if the other lua entity exists
      if (!matchingConnections.has(otherEntity) && otherEntity.getWorldEntity(stage)) {
        content.removeCableConnection(entity, otherEntity)
        hasDiff = true
      }
    }
  }

  let maxConnectionsExceeded: boolean | nil
  for (const add of newConnections) {
    const result = content.addCableConnection(entity, add)
    if (result == CableAddResult.MaxConnectionsReached) maxConnectionsExceeded = true
  }

  return $multi(hasDiff, maxConnectionsExceeded)
}

function saveWireConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  higherStageForMerging?: StageNumber,
): LuaMultiReturn<
  [hasAnyDiff: boolean, maxConnectionsExceeded?: boolean, additionalEntitiesToUpdate?: ProjectEntity[]]
> {
  const [diff2, maxConnectionsExceeded] = saveCableConnections(content, entity, stage, higherStageForMerging)
  const [diff1, additionalEntitiesToUpdate] = saveCircuitConnections(content, entity, stage)

  return $multi(diff1 || diff2, maxConnectionsExceeded, additionalEntitiesToUpdate)
}

function partitionExistingCircuitConnections(
  projectConnections: ProjectEntityCircuitConnections | nil,
  luaEntity: LuaEntity,
  existingConnections: readonly CircuitOrPowerSwitchConnection[],
  content: ProjectContent,
  stage: StageNumber,
): LuaMultiReturn<
  [
    matchingConnections: LuaMap<ProjectCircuitConnection, CircuitOrPowerSwitchConnection>,
    extraConnections: LuaMap<CircuitOrPowerSwitchConnection, ProjectEntity>,
  ]
> {
  const matching = new LuaMap<ProjectCircuitConnection, CircuitOrPowerSwitchConnection>()
  const extra = new LuaMap<CircuitOrPowerSwitchConnection, ProjectEntity>()

  for (const existingConnection of existingConnections) {
    const otherLuaEntity = existingConnection.target_entity
    if (luaEntity == otherLuaEntity && existingConnection.source_circuit_id > existingConnection.target_circuit_id) {
      // only count connections to self once
      continue
    }
    const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
    if (!otherEntity) continue
    let matchingConnection: ProjectCircuitConnection | nil
    if (projectConnections) {
      const otherConnections = projectConnections.get(otherEntity)
      matchingConnection =
        otherConnections && findMatchingCircuitConnection(otherConnections, otherEntity, existingConnection)
    }
    if (matchingConnection) {
      matching.set(matchingConnection, existingConnection)
    } else {
      extra.set(existingConnection, otherEntity)
    }
  }
  return $multi(matching, extra)
}

function findMatchingCircuitConnection(
  connections: ReadonlyLuaSet<ProjectCircuitConnection>,
  toEntity: ProjectEntity,
  { source_circuit_id, target_circuit_id, wire }: CircuitOrPowerSwitchConnection,
): ProjectCircuitConnection | nil {
  for (const connection of connections) {
    if (circuitConnectionMatches(connection, wire, toEntity, source_circuit_id, target_circuit_id)) {
      return connection
    }
  }
}

export { updateWireConnectionsAtStage, saveWireConnections }

// noinspection JSUnusedGlobalSymbols
export const _mockable = true
