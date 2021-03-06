/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

(function() {

    if (self.base.Bounds) return;

    /**
     *
     * @constructor
     */
    function Bounds() {
        this.minx = 10e7;
        this.miny = 10e7;
        this.maxx = -10e7;
        this.maxy = -10e7;
        this.leftMost = null;
    }

    const BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        PRO = Bounds.prototype;

    BASE.Bounds = Bounds;
    BASE.newBounds = newBounds;

    /** ******************************************************************
     * Bounds Prototype Functions
     ******************************************************************* */

    /**
     * @returns {Bounds}
     */
    PRO.clone = function() {
        let b = new Bounds();
        b.minx = this.minx;
        b.miny = this.miny;
        b.maxx = this.maxx;
        b.maxy = this.maxy;
        return b;
    };

    PRO.equals = function(bounds, margin) {
        if (!margin) margin = BASE.config.precision_offset;
        return UTIL.isCloseTo(this.minx, bounds.minx, margin) &&
            UTIL.isCloseTo(this.miny, bounds.miny, margin) &&
            UTIL.isCloseTo(this.maxx, bounds.maxx, margin) &&
            UTIL.isCloseTo(this.maxy, bounds.maxy, margin);
    };

    /**
     * @param {Bounds} b
     */
    PRO.merge = function(b) {
        this.minx = Math.min(this.minx, b.minx);
        this.maxx = Math.max(this.maxx, b.maxx);
        this.miny = Math.min(this.miny, b.miny);
        this.maxy = Math.max(this.maxy, b.maxy);
    };

    /**
     * @param {Point} p
     */
    PRO.update = function(p) {
        this.minx = Math.min(this.minx, p.x);
        this.maxx = Math.max(this.maxx, p.x);
        this.miny = Math.min(this.miny, p.y);
        this.maxy = Math.max(this.maxy, p.y);
        if (this.minx === p.x) this.leftMost = p;
    };

    PRO.contains = function(bounds) {
        return bounds.isNested(this);
    };

    PRO.containsXY = function(x,y) {
        return x >= this.minx && x <= this.maxx && y >= this.miny && y <= this.maxy;
    };

    PRO.containsOffsetXY = function(x,y,offset) {
        return x >= this.minx-offset && x <= this.maxx+offset && y >= this.miny-offset && y <= this.maxy+offset;
    };

    /**
     * @param {Bounds} parent
     * @returns {boolean} true if fully inside parent bounds
     */
    PRO.isNested = function(parent) {
        return (
            this.minx >= parent.minx - CONF.precision_bounds && // min-x
            this.maxx <= parent.maxx + CONF.precision_bounds && // max-x
            this.miny >= parent.miny - CONF.precision_bounds && // min-y
            this.maxy <= parent.maxy + CONF.precision_bounds    // max-y
        );
    };

    /**
     * @param {Bounds} b
     * @param {number} precision
     * @returns {boolean}
     */
    PRO.overlaps = function(b, precision) {
        return (
            Math.abs(this.centerx() - b.centerx()) * 2 - precision < this.width() + b.width() &&
            Math.abs(this.centery() - b.centery()) * 2 - precision < this.height() + b.height()
        );
    };

    PRO.width = function() {
        return this.maxx - this.minx;
    };

    PRO.height = function() {
        return this.maxy - this.miny;
    };

    PRO.centerx = function() {
        return this.minx + this.width() / 2;
    };

    PRO.centery = function() {
        return this.miny + this.height() / 2;
    };

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    function newBounds() {
        return new Bounds();
    }

})();
