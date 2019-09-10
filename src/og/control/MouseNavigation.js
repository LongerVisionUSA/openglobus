/**
 * @module og/control/MouseNavigation
 */

'use strict';

import * as math from '../math.js';
import { Control } from './Control.js';
import { input } from '../input/input.js';
import { Key } from '../Lock.js';
import { LonLat } from '../LonLat.js';
import { Mat4 } from '../math/Mat4.js';
import { Quat } from '../math/Quat.js';
import { Ray } from '../math/Ray.js';
import { Sphere } from '../bv/Sphere.js';
import { Vec3 } from '../math/Vec3.js';


/**
 * Mouse planet camera dragging control.
 * @class
 * @extends {og.control.Control}
 * @param {Object} [options] - Control options.
 */
class MouseNavigation extends Control {
    constructor(options) {
        super(options);

        this._name = "mouseNavigation";

        options = options || {};

        this.grabbedPoint = new Vec3();
        this._eye0 = new Vec3();
        this.pointOnEarth = new Vec3();
        this.earthUp = new Vec3();
        this.inertia = 0.007;
        this.grabbedSpheroid = new Sphere();
        this.planet = null;
        this.qRot = new Quat();
        this.scaleRot = 0.0;

        this.distDiff = 0.33;
        this.stepsCount = 5;
        this.stepsForward = null;
        this.stepIndex = 0;

        this._keyLock = new Key();
    }

    static getMovePointsFromPixelTerrain(cam, planet, stepsCount, delta, point, forward, dir) {

        var steps = []

        var eye = cam.eye.clone(),
            n = cam._n.clone(),
            u = cam._u.clone(),
            v = cam._v.clone();

        var a = planet.getCartesianFromPixelTerrain(point, true);

        if (!a) {
            a = planet.getCartesianFromPixelTerrain(planet.renderer.handler.getCenter(), true);
        }

        if (a) {

            if (!dir) {
                dir = Vec3.sub(a, cam.eye).normalize();
            }

            var d = a ? delta * cam.eye.distance(a) / stepsCount : 1000;

            if (forward) {
                d = -d;
            } else {
                d *= 2;
            }

            var scaled_n = n.scaleTo(d);

            if (a && cam.slope >= 0.0) {
                var grabbedSpheroid = new Sphere();
                grabbedSpheroid.radius = a.length();

                var rotArr = [],
                    eyeArr = []

                var breaked = false;
                for (var i = 0; i < stepsCount; i++) {
                    eye.addA(scaled_n);
                    var b = new Ray(eye, dir).hitSphere(grabbedSpheroid);
                    eyeArr[i] = eye.clone();
                    if (b) {
                        rotArr[i] = new Mat4().rotateBetweenVectors(a.normal(), b.normal());
                    } else {
                        breaked = true;
                        break;
                    }
                }

                if (!breaked) {
                    for (var i = 0; i < stepsCount; i++) {
                        var rot = rotArr[i];
                        steps[i] = {};
                        steps[i].eye = rot.mulVec3(eyeArr[i]);
                        steps[i].v = rot.mulVec3(v);
                        steps[i].u = rot.mulVec3(u);
                        steps[i].n = rot.mulVec3(n);
                    }
                } else {
                    eye = cam.eye.clone();
                    for (var i = 0; i < stepsCount; i++) {
                        steps[i] = {};
                        steps[i].eye = eye.addA(scaled_n).clone();
                        steps[i].v = v;
                        steps[i].u = u;
                        steps[i].n = n;
                    }
                }
            } else {
                for (var i = 0; i < stepsCount; i++) {
                    steps[i] = {};
                    steps[i].eye = eye.addA(dir.scaleTo(-d)).clone();
                    steps[i].v = v;
                    steps[i].u = u;
                    steps[i].n = n;
                }
            }

            return steps;
        }
    }

    onactivate() {
        this.renderer.events.on("mousewheel", this.onMouseWheel, this);
        this.renderer.events.on("lhold", this.onMouseLeftButtonDown, this);
        this.renderer.events.on("rhold", this.onMouseRightButtonDown, this);
        this.renderer.events.on("ldown", this.onMouseLeftButtonClick, this);
        this.renderer.events.on("lup", this.onMouseLeftButtonUp, this);
        this.renderer.events.on("rdown", this.onMouseRightButtonClick, this);
        this.renderer.events.on("ldblclick", this.onMouseLeftButtonDoubleClick, this);
        this.renderer.events.on("draw", this.onDraw, this);
        this.renderer.events.on("mousemove", this.onMouseMove, this);
    }

    ondeactivate() {
        this.renderer.events.off("mousewheel", this.onMouseWheel);
        this.renderer.events.off("lhold", this.onMouseLeftButtonDown);
        this.renderer.events.off("rhold", this.onMouseRightButtonDown);
        this.renderer.events.off("ldown", this.onMouseLeftButtonClick);
        this.renderer.events.off("lup", this.onMouseLeftButtonUp);
        this.renderer.events.off("rdown", this.onMouseRightButtonClick);
        this.renderer.events.off("ldblclick", this.onMouseLeftButtonDoubleClick);
        this.renderer.events.off("draw", this.onDraw);
    };

    onMouseWheel(event) {

        if (this.stepIndex)
            return;

        this.planet.stopFlying();

        this.stopRotation();

        this._deactivate = true;

        this.planet.layerLock.lock(this._keyLock);
        this.planet.terrainLock.lock(this._keyLock);
        this.planet._normalMapCreator.lock(this._keyLock);

        var ms = this.renderer.events.mouseState;
        this.stepsForward = MouseNavigation.getMovePointsFromPixelTerrain(this.renderer.activeCamera,
            this.planet, this.stepsCount, this.distDiff, ms, event.wheelDelta > 0, ms.direction);
        if (this.stepsForward) {
            this.stepIndex = this.stepsCount;
        }
    }

    oninit() {
        this.activate();

        this.renderer.events.on("keyfree", input.KEY_SHIFT, this.onShiftFree, this);
    }

    onMouseLeftButtonDoubleClick() {
        this.planet.stopFlying();
        this.stopRotation();
        var p = this.planet.getCartesianFromPixelTerrain(this.renderer.events.mouseState, true),
            g = this.planet.ellipsoid.cartesianToLonLat(p);
        if (this.renderer.events.isKeyPressed(input.KEY_SHIFT)) {
            this.planet.flyLonLat(new LonLat(g.lon, g.lat, this.renderer.activeCamera.eye.distance(p) * 2.0));
        } else {
            this.planet.flyLonLat(new LonLat(g.lon, g.lat, this.renderer.activeCamera.eye.distance(p) * 0.57));
        }
    }

    onMouseLeftButtonClick() {
        if (this._active) {
            this.renderer.handler.canvas.classList.add("ogGrabbingPoiner");
            this.grabbedPoint = this.planet.getCartesianFromMouseTerrain(true);
            if (this.grabbedPoint) {
                this._eye0.copy(this.renderer.activeCamera.eye);
                this.grabbedSpheroid.radius = this.grabbedPoint.length();
                this.stopRotation();
            }
        }
    }

    stopRotation() {
        this.qRot.clear();
        this.planet.layerLock.free(this._keyLock);
        this.planet.terrainLock.free(this._keyLock);
        this.planet._normalMapCreator.free(this._keyLock);
    }

    onMouseLeftButtonUp(e) {
        this.renderer.handler.canvas.classList.remove("ogGrabbingPoiner");
        if (e.x === e.prev_x && e.y === e.prev_y) {
            this.scaleRot = 0.0;
        }
    }

    onMouseLeftButtonDown(e) {
        if (this._active) {
            if (!this.grabbedPoint)
                return;

            this.planet.stopFlying();

            if (this.renderer.events.mouseState.moving) {

                var cam = this.renderer.activeCamera;

                if (cam.slope > 0.2) {
                    var targetPoint = new Ray(cam.eye, e.direction).hitSphere(this.grabbedSpheroid);
                    if (targetPoint) {
                        this.scaleRot = 1.0;
                        this.qRot = Quat.getRotationBetweenVectors(targetPoint.normal(), this.grabbedPoint.normal());
                        var rot = this.qRot;
                        cam.eye = rot.mulVec3(cam.eye);
                        cam._v = rot.mulVec3(cam._v);
                        cam._u = rot.mulVec3(cam._u);
                        cam._n = rot.mulVec3(cam._n);

                        cam.checkTerrainCollision();

                        cam.update();
                    }
                } else {

                    var p0 = this.grabbedPoint,
                        p1 = Vec3.add(p0, cam._u),
                        p2 = Vec3.add(p0, p0.normal());

                    var px = new Vec3();
                    if (new Ray(cam.eye, e.direction).hitPlane(p0, p1, p2, px) === Ray.INSIDE) {
                        cam.eye = this._eye0.addA(px.subA(p0).negate());

                        cam.checkTerrainCollision();

                        cam.update();
                    }
                }
            }
        }
    }

    onMouseRightButtonClick(e) {
        this.stopRotation();
        this.planet.stopFlying();
        this.pointOnEarth = this.planet.getCartesianFromPixelTerrain({ x: e.x, y: e.y }, true);
        if (this.pointOnEarth) {
            this.earthUp = this.pointOnEarth.normal();
        }
    };

    onMouseRightButtonDown(e) {
        var cam = this.renderer.activeCamera;
        if (this.pointOnEarth && this.renderer.events.mouseState.moving) {
            this.renderer.controlsBag.scaleRot = 1.0;
            var l = 0.5 / cam.eye.distance(this.pointOnEarth) * cam._lonLat.height * math.RADIANS;
            if (l > 0.007) l = 0.007;
            cam.rotateHorizontal(l * (e.x - e.prev_x), false, this.pointOnEarth, this.earthUp);
            cam.rotateVertical(l * (e.y - e.prev_y), this.pointOnEarth);

            cam.checkTerrainCollision();

            cam.update();
        }
    }

    onShiftFree() {
        this._shiftBusy = false;
    }

    onMouseMove(e) {

        if (this._active && this.renderer.events.isKeyPressed(input.KEY_SHIFT)) {

            if (!this._shiftBusy) {
                this._shiftBusy = true;
                this.onMouseRightButtonClick(e);
            }

            this.onMouseRightButtonDown(e);
        }
    }

    onDraw(e) {

        if (this._active) {

            var r = this.renderer;
            var cam = r.activeCamera;
            var prevEye = cam.eye.clone();

            if (this.stepIndex) {
                r.controlsBag.scaleRot = 1.0;
                var sf = this.stepsForward[this.stepsCount - this.stepIndex--];
                cam.eye = sf.eye;
                cam._v = sf.v;
                cam._u = sf.u;
                cam._n = sf.n;

                cam.checkTerrainCollision();

                cam.update();
            } else {
                if (this._deactivate) {
                    this._deactivate = false;

                    this.planet.layerLock.free(this._keyLock);
                    this.planet.terrainLock.free(this._keyLock);
                    this.planet._normalMapCreator.free(this._keyLock);
                }
            }

            if (r.events.mouseState.leftButtonDown || !this.scaleRot)
                return;

            this.scaleRot -= this.inertia;
            if (this.scaleRot <= 0.0) {
                this.scaleRot = 0.0;
            } else {

                r.controlsBag.scaleRot = this.scaleRot;
                var rot = this.qRot.slerp(Quat.IDENTITY, 1.0 - this.scaleRot * this.scaleRot * this.scaleRot).normalize();
                if (!(rot.x || rot.y || rot.z)) {
                    this.scaleRot = 0.0;
                }
                cam.eye = rot.mulVec3(cam.eye);
                cam._v = rot.mulVec3(cam._v);
                cam._u = rot.mulVec3(cam._u);
                cam._n = rot.mulVec3(cam._n);

                cam.checkTerrainCollision();

                cam.update();
            }

            if (cam.eye.distance(prevEye) / cam._terrainAltitude > 0.01) {
                this.planet.layerLock.lock(this._keyLock);
                this.planet.terrainLock.lock(this._keyLock);
                this.planet._normalMapCreator.lock(this._keyLock);
            } else {
                this.planet.layerLock.free(this._keyLock);
                this.planet.terrainLock.free(this._keyLock);
                this.planet._normalMapCreator.free(this._keyLock);
            }
        }
    }
};

export { MouseNavigation };