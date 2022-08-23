/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { LayerNumber } from "../entity/AssemblyEntity"
import { Events } from "../lib"
import { BBox } from "../lib/geometry"

declare const global: {
  bpSurfaces: LuaSurface[]
  surfaceIndexToLayerIndex: Record<SurfaceIndex, LayerNumber>
}

Events.on_init(() => {
  global.bpSurfaces = [game.surfaces[1]]
  global.surfaceIndexToLayerIndex = { [1 as SurfaceIndex]: 1 }
})

export function generateAssemblySurfaces(amount: number): void {
  const numExisting = global.bpSurfaces.length
  for (let i = numExisting; i < amount; i++) {
    global.bpSurfaces[i] = createBpSurface(i + 1)
  }
}

function createBpSurface(number: number): LuaSurface {
  const result = game.create_surface("bp3-layer-" + number)
  result.always_day = true
  result.generate_with_lab_tiles = true
  global.surfaceIndexToLayerIndex[result.index] = number
  return result
}

/** 1 indexed */
export function getAssemblySurface(index: number): LuaSurface | nil {
  return global.bpSurfaces[index - 1]
}

export function getOrGenerateAssemblySurface(index: number): LuaSurface {
  const surface = getAssemblySurface(index)
  if (surface) return surface
  generateAssemblySurfaces(index)
  return getAssemblySurface(index)!
}

export function prepareArea(surface: LuaSurface, area: BBox): void {
  const { is_chunk_generated, set_chunk_generated_status } = surface
  const status = defines.chunk_generated_status.entities
  const pos = { x: 0, y: 0 }
  const chunkArea = BBox.scale(area, 1 / 32).roundTile()
  for (const [x, y] of chunkArea.iterateTiles()) {
    pos.x = x
    pos.y = y
    if (!is_chunk_generated(pos)) {
      set_chunk_generated_status(pos, status)
    }
  }
  const actualArea = chunkArea.scale(32)
  surface.build_checkerboard(actualArea)
}
