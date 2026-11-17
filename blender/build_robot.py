"""Builds the companion robot (flat-front design) in several colour shades and exports each as .glb.

Run with Blender 5.1:
    blender --background --factory-startup --python blender/build_robot.py
or inside a running Blender (e.g. via the Blender MCP server):
    exec(open(r"C:/Workspace/rusty-companion/blender/build_robot.py").read())

Part naming contract with the app (src/renderer/robot.ts), per shade prefix X:
    X_Root (empty at the feet) -> X_Body (shell, origin at body bottom) -> X_Screen, X_ArmL, X_ArmR, details
    X_Root -> X_LegL, X_LegR (origins at the hips)
    X_ArmL -> X_Notepad, X_Mug (props in the left hand, origins at their centres; the app hides them
    until needed and keeps them upright while the arm moves)
Arms and legs have their origins at the shoulder / hip so the app can rotate them.
The face is not modelled: the app draws it at runtime on the Screen quad (UVs 0..1, aspect 5:4).
The app renders every material flat (unlit), so shading is baked into colours: the box's side,
back and bottom faces use a darker shade and the top a lighter one.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

try:
    # This repo's assets/colors (the script lives in <repo>/blender/).
    OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "colors")
except NameError:
    # exec() inside a running Blender has no __file__.
    OUT_DIR = r"C:/Workspace/rusty-companion/assets/colors"
SCENE_NAME = "CompanionRobot"

INK = "#2B211C"   # buttons and slots
LIMB = "#141110"  # arms and legs (blacker than the buttons)
CREAM = "#F4EDE4"

# Same design, different shades of the body colour.
PALETTES = {
    "burnt": "#B5603F",  # darker Claude orange (the chosen look)
}

DESIGN = dict(
    w=1.03, h=0.95, d=0.4,               # box around the same screen: slim side gaps, bigger top gap
    screen_w=0.8, screen_aspect=0.8,     # screen 0.8 x 0.64
    screen_top_margin=0.11,
    buttons_z=0.105,
    leg=0.35, leg_r=0.042, foot=0.095,   # straight tube legs with a short forward foot
    arm=0.38, arm_r=0.038, shoulder=0.3,   # arms start low; plain tubes with rounded ends
)


def shade(hex_color, f):
    rgb = [int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{max(0, min(255, round(c * f))):02X}" for c in rgb)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    rgb = [srgb_to_linear(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    mat.diffuse_color = (*rgb, 1.0)
    return mat


class Builder:
    def __init__(self, scene, prefix, offset_x, mats):
        self.prefix = prefix
        self.mats = mats
        self.offset = Vector((offset_x, 0, 0))
        self.coll = bpy.data.collections.new(f"Robot_{prefix}")
        scene.collection.children.link(self.coll)
        self.world = {}
        self.root = self._link("Root", None, Vector((0, 0, 0)), None)
        self.root.empty_display_size = 0.2

    def _link(self, name, data, pivot, parent):
        full = f"{self.prefix}_{name}"
        ob = bpy.data.objects.new(full, data)
        self.coll.objects.link(ob)
        world = self.offset + pivot
        if parent is not None:
            ob.parent = parent
            ob.location = world - self.world[parent.name]
        else:
            ob.location = world
        self.world[full] = world
        return ob

    def mesh(self, name, bm, pivot, mats, parent, smooth=False):
        me = bpy.data.meshes.new(f"{self.prefix}_{name}")
        bm.to_mesh(me)
        bm.free()
        for m in mats if isinstance(mats, list) else [mats]:
            me.materials.append(m)
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        return self._link(name, me, Vector(pivot), parent)

    def box(self, name, size, center, pivot, mat, parent):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector(center) - Vector(pivot), verts=bm.verts)
        return self.mesh(name, bm, pivot, mat, parent)

    def shaded_box(self, name, size, center, pivot, front, side, top, parent):
        """Box whose faces get a material by direction: 0 = front (-Y), 1 = sides/back/bottom, 2 = top."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector(center) - Vector(pivot), verts=bm.verts)
        for f in bm.faces:
            n = f.normal
            f.material_index = 0 if n.y < -0.9 else (2 if n.z > 0.9 else 1)
        return self.mesh(name, bm, pivot, [front, side, top], parent)

    def cylinder(self, name, radius, length, center, pivot, mat, parent, axis="Z", segments=12):
        bm = bmesh.new()
        rot = {"Z": Matrix.Identity(4), "Y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                              radius1=radius, radius2=radius, depth=length, matrix=rot)
        bmesh.ops.translate(bm, vec=Vector(center) - Vector(pivot), verts=bm.verts)
        return self.mesh(name, bm, pivot, mat, parent, smooth=True)

    def sphere(self, name, radius, center, pivot, mat, parent):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=radius)
        bmesh.ops.translate(bm, vec=Vector(center) - Vector(pivot), verts=bm.verts)
        return self.mesh(name, bm, pivot, mat, parent, smooth=True)

    def screen(self, width, aspect, center, parent):
        """Flat quad facing -Y (towards the viewer), UVs 0..1. Aspect must match the face canvas."""
        h = width * aspect
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new("UVMap")
        coords = [(-width / 2, 0, -h / 2), (width / 2, 0, -h / 2), (width / 2, 0, h / 2), (-width / 2, 0, h / 2)]
        face = bm.faces.new([bm.verts.new(c) for c in coords])
        for loop, (u, v) in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[uv].uv = (u, v)
        return self.mesh("Screen", bm, center, self.mats["screen"], parent)

    def capsule_limb(self, name, pivot, length, radius, parent, foot=0.0):
        """A tube hanging down from its pivot with rounded (hemispherical) ends, in the body colour.
        With foot > 0 a short rounded tube points forward (-Y) from the bottom, like a little foot."""
        pivot = Vector(pivot)
        mat = self.mats["limb"]
        ob = self.cylinder(name, radius, length, pivot - Vector((0, 0, length / 2)), pivot, mat, parent)
        self.sphere(f"{name}Top", radius, pivot, pivot, mat, ob)
        end = pivot - Vector((0, 0, length))
        self.sphere(f"{name}End", radius, end, end, mat, ob)
        if foot > 0:
            fc = end + Vector((0, -foot / 2, 0))
            self.cylinder(f"{name}Foot", radius, foot, fc, end, mat, ob, axis="Y")
            tip = end + Vector((0, -foot, 0))
            self.sphere(f"{name}Toe", radius, tip, tip, mat, ob)
        return ob


def build(scene, prefix, x, body_hex):
    mats = dict(
        front=material(f"{prefix}_Front", body_hex),
        side=material(f"{prefix}_Side", shade(body_hex, 0.8)),
        top=material(f"{prefix}_Top", shade(body_hex, 1.1)),
        limb=material(f"{prefix}_Limb", LIMB),  # arms and legs: near-black
        rim=material(f"{prefix}_Rim", shade(body_hex, 0.72)),
        ink=material(f"{prefix}_Ink", INK),
        screen=material(f"{prefix}_Screen", CREAM),
    )
    p = DESIGN
    b = Builder(scene, prefix, x, mats)
    w, h, d = p["w"], p["h"], p["d"]
    base = Vector((0, 0, p["leg"]))  # body bottom
    body = b.shaded_box("Body", (w, d, h), base + Vector((0, 0, h / 2)), base,
                        mats["front"], mats["side"], mats["top"], b.root)
    front = -d / 2

    # Screen (same width as before, taller) with a thin rim behind it.
    sw = p["screen_w"]
    sh = sw * p["screen_aspect"]
    sz = h - p["screen_top_margin"] - sh / 2
    rim_c = base + Vector((0, front - 0.005, sz))
    b.box("Rim", (sw + 0.06, 0.02, sh + 0.06), rim_c, rim_c, mats["rim"], body)
    b.screen(sw, p["screen_aspect"], base + Vector((0, front - 0.018, sz)), body)

    # Buttons from the sketch: a round ring button on the left, two small slots on the right.
    bz = p["buttons_z"]
    c = base + Vector((-w * 0.28, front - 0.01, bz))
    b.cylinder("ButtonRing", 0.055, 0.03, c, c, mats["ink"], body, axis="Y", segments=16)
    c2 = c + Vector((0, -0.012, 0))
    b.cylinder("ButtonCap", 0.04, 0.03, c2, c2, mats["rim"], body, axis="Y", segments=16)
    c3 = c + Vector((0, -0.024, 0))
    b.cylinder("ButtonDot", 0.014, 0.03, c3, c3, mats["ink"], body, axis="Y", segments=10)
    for i, sx in enumerate((w * 0.17, w * 0.26)):
        s = base + Vector((sx, front - 0.008, bz))
        b.box(f"Slot{i}", (0.034, 0.02, 0.075), s, s, mats["ink"], body)

    # Arms: start low, plain tubes with rounded ends.
    ar = p["arm_r"]
    shz = h * p["shoulder"]
    arm_l = b.capsule_limb("ArmL", base + Vector((w / 2 + ar, 0, shz)), p["arm"], ar, body)
    b.capsule_limb("ArmR", base + Vector((-w / 2 - ar, 0, shz)), p["arm"], ar, body)

    # Props held in the left hand. Hidden by the app until needed.
    hand = base + Vector((w / 2 + ar, 0, shz - p["arm"]))
    # Notepad: cream paper with a clip and three written lines, held by its bottom edge.
    pad_c = hand + Vector((0, -0.05, 0.12))
    pad = b.box("Notepad", (0.23, 0.014, 0.29), pad_c, pad_c, mats["screen"], arm_l)
    for i in range(3):
        lc = pad_c + Vector((-0.012 * i, -0.009, 0.05 - i * 0.06))
        b.box(f"NotepadLine{i}", (0.16 - 0.03 * i, 0.004, 0.016), lc, lc, mats["ink"], pad)
    cc = pad_c + Vector((0, -0.009, 0.13))
    b.box("NotepadClip", (0.1, 0.008, 0.03), cc, cc, mats["ink"], pad)
    # Mug: dark rust cup (stands out against the cream screen) with an ink handle and coffee.
    mug_c = hand + Vector((0, -0.06, 0.03))
    mug = b.cylinder("Mug", 0.05, 0.1, mug_c, mug_c, mats["rim"], arm_l, segments=16)
    hc = mug_c + Vector((0.06, 0, 0))
    b.box("MugHandle", (0.024, 0.022, 0.06), hc, hc, mats["ink"], mug)
    tc = mug_c + Vector((0, 0, 0.046))
    b.cylinder("MugCoffee", 0.042, 0.012, tc, tc, mats["ink"], mug, segments=16)

    # Legs: straight tubes with a short rounded foot pointing forward.
    lr = p["leg_r"]
    for name, lx in (("LegL", w * 0.24), ("LegR", -w * 0.24)):
        b.capsule_limb(name, Vector((lx, 0, p["leg"])), p["leg"] - lr, lr, b.root, foot=p["foot"])
    return b


# ---------------------------------------------------------------------------------------------
# Animation clips. All clips live on one timeline; the app cuts them apart by frame range, so this
# table must match CLIPS in src/renderer/robot.ts. Every clip starts and ends in the rest pose.
# ---------------------------------------------------------------------------------------------
FPS = 24
CLIPS = {"Hop": (1, 17), "Wave": (24, 48), "Cheer": (56, 76)}


def animate(b):
    p = b.prefix
    obs = {n: bpy.data.objects[f"{p}_{n}"] for n in ("Root", "Body", "ArmL", "ArmR", "LegL", "LegR")}
    rest = {n: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy()) for n, o in obs.items()}

    def key(frame, **poses):
        """poses: name=dict(z=..., rx=..., ry=..., sx=..., sz=...) offsets from rest; others go to rest."""
        for n, o in obs.items():
            loc, rot, scl = rest[n]
            d = poses.get(n, {})
            o.location = (loc.x, loc.y, loc.z + d.get("z", 0.0))
            o.rotation_euler = (rot.x + d.get("rx", 0.0), rot.y + d.get("ry", 0.0), rot.z)
            s = d.get("s", (1.0, 1.0, 1.0))
            o.scale = (scl.x * s[0], scl.y * s[1], scl.z * s[2])
            for path in ("location", "rotation_euler", "scale"):
                o.keyframe_insert(data_path=path, frame=frame)

    # Arms swing outwards around the Y axis: ArmL (on +X) goes up with negative ry, ArmR with positive.
    # Legs swing forward (towards -Y, the viewer) with negative rx.
    # Hop: crouch, spring up (arms up, legs tucked), land with a squash, settle.
    key(1)
    key(5, Body=dict(z=-0.06, s=(1.08, 1.08, 0.84)), ArmL=dict(ry=0.5), ArmR=dict(ry=-0.5))
    key(9, Root=dict(z=0.55), Body=dict(s=(0.94, 0.94, 1.1)), ArmL=dict(ry=-2.2), ArmR=dict(ry=2.2),
        LegL=dict(rx=-0.45), LegR=dict(rx=-0.45))
    key(13, Body=dict(z=-0.05, s=(1.1, 1.1, 0.82)), ArmL=dict(ry=-0.9), ArmR=dict(ry=0.9))
    key(17)

    # Wave: raise the left arm, wave three times with a little lean, lower it.
    key(24)
    key(28, ArmL=dict(ry=-2.4), Body=dict(ry=-0.06))
    for f, a in ((31, -2.0), (34, -2.6), (37, -2.0), (40, -2.6)):
        key(f, ArmL=dict(ry=a), Body=dict(ry=-0.06))
    key(44, ArmL=dict(ry=-2.3), Body=dict(ry=-0.04))
    key(48)

    # Cheer: small crouch, two jumps with both arms up.
    key(56)
    key(60, Body=dict(z=-0.04, s=(1.05, 1.05, 0.9)))
    key(64, Root=dict(z=0.3), Body=dict(s=(0.96, 0.96, 1.06)), ArmL=dict(ry=-2.6), ArmR=dict(ry=2.6))
    key(67, Body=dict(z=-0.04, s=(1.06, 1.06, 0.9)), ArmL=dict(ry=-2.3), ArmR=dict(ry=2.3))
    key(70, Root=dict(z=0.18), ArmL=dict(ry=-2.6), ArmR=dict(ry=2.6))
    key(73, Body=dict(z=-0.03, s=(1.04, 1.04, 0.93)), ArmL=dict(ry=-1.2), ArmR=dict(ry=1.2))
    key(76)

    # Leave the scene showing the rest pose.
    bpy.context.scene.frame_set(1)


def main():
    if bpy.context.window is None:
        # Background mode: a freshly created scene crashed Blender 5.1, so reuse the startup scene.
        scene = bpy.context.scene
        scene.name = SCENE_NAME
        for ob in list(scene.collection.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    else:
        scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
        bpy.context.window.scene = scene
    for coll in list(scene.collection.children):
        for ob in list(coll.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        if coll.name.startswith("Robot_"):
            bpy.data.collections.remove(coll)

    builders = {name: build(scene, name, i * 2.0, hexc) for i, (name, hexc) in enumerate(PALETTES.items())}
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = max(end for _, end in CLIPS.values())
    for b in builders.values():
        animate(b)

    # Note: a temp_override(scene=...) around the exporter crashed Blender 5.1, so none is used.
    os.makedirs(OUT_DIR, exist_ok=True)
    view_layer = bpy.context.view_layer
    exported = []
    for name, b in builders.items():
        for ob in scene.objects:
            ob.select_set(False)
        for ob in b.coll.all_objects:
            ob.select_set(True)
        view_layer.objects.active = b.root
        path = os.path.join(OUT_DIR, f"robot_{name}.glb")
        # All objects' keyframes become ONE glTF animation ("Clips"); the app splits it by frame range.
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True, export_apply=True,
            export_yup=True, export_cameras=False, export_lights=False,
            export_animations=True, export_animation_mode="ACTIVE_ACTIONS",
            export_nla_strips_merged_animation_name="Clips", export_force_sampling=True,
            export_optimize_animation_size=False,
        )
        exported.append({"color": name, "bytes": os.path.getsize(path),
                         "faces": sum(len(o.data.polygons) for o in b.coll.all_objects if o.type == "MESH")})
    for ob in scene.objects:
        ob.select_set(False)
    return exported


result = {"exported": main()}
print("RESULT", result)
