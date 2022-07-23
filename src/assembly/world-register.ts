import { Events } from "../lib"
import { Pos, Position } from "../lib/geometry"
import { AssemblyPosition, LayerPosition } from "./Assembly"
import floor = math.floor

type LayersByChunk = Record<number, Record<number, LayerPosition | nil>>
declare const global: {
  inWorldLayers: Record<SurfaceIndex, LayersByChunk>
}

Events.on_init(() => {
  global.inWorldLayers = {}
  for (const [, surface] of game.surfaces) {
    global.inWorldLayers[surface.index] = {}
  }
})
Events.on_surface_created((e) => {
  global.inWorldLayers[e.surface_index] = {}
})
Events.on_pre_surface_deleted((e) => {
  delete global.inWorldLayers[e.surface_index]
})

function addLayer(layer: LayerPosition): void {
  const surface = layer.surface
  if (!surface.valid) return
  const layersByChunk = global.inWorldLayers[surface.index]
  const topLeft = Pos.div(layer.left_top, 32).floor()
  const bottomRight = Pos.div(layer.right_bottom, 32).ceil()
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = layersByChunk[x] ?? (layersByChunk[x] = {})
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      byX[y] = layer
    }
  }
}

function removeLayer(layer: LayerPosition): void {
  const surface = layer.surface
  if (!surface.valid) return
  const layersByChunk = global.inWorldLayers[surface.index]
  const topLeft = Pos.div(layer.left_top, 32).floor()
  const bottomRight = Pos.div(layer.right_bottom, 32).ceil()
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = layersByChunk[x]
    if (!byX) continue
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      delete byX[y]
    }
    if (next(byX)[0] === nil) delete layersByChunk[x]
  }
}

export function registerAssembly(assembly: AssemblyPosition): void {
  // todo: listen to layer updates
  for (const layer of assembly.layers) {
    addLayer(layer)
  }
}

export function deleteAssembly(assembly: AssemblyPosition): void {
  for (const layer of assembly.layers) {
    removeLayer(layer)
  }
}

export function getLayerAtPosition(surface: LuaSurface, position: Position): LayerPosition | nil {
  const bySurface = global.inWorldLayers[surface.index]
  if (!bySurface) return nil
  const byX = bySurface[floor(position.x / 32)]
  if (!byX) return nil
  return byX[floor(position.y / 32)]
}
