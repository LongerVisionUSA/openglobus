og.planetSegment = { };

og.planetSegment.LON = 0;
og.planetSegment.LAT = 1;

og.planetSegment.inverseMercator = function (x, y) {
    var pole = 20037508.34;
    var lon = 180 * x / pole;
    var lat = 180 / Math.PI * (2 * Math.atan(Math.exp((y / pole) * Math.PI)) - Math.PI / 2);
    return [lon, lat];
};

og.planetSegment.forwardMercator = function (lon, lat) {
    var pole = 20037508.34;
    var x = lon * pole / 180;
    var y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / Math.PI * pole;
    return [x, y];
};

og.planetSegment.PlanetSegment = function () {
    this.texture = null;
    this.plainVertices = [];
    this.terrainVertices = [];
    this.texBias = [];
    this.bbox = new og.bv.Box();
    this.bsphere = new og.bv.Sphere();

    this.vertexPositionBuffer;
    this.vertexIndexBuffer;
    this.vertexTextureCoordBuffer;

    this.extent = [];
    this.gridSize;

    this.zoomIndex;
    this.tileX;
    this.tileY;

    this.planet;
    this._ctx = null;

    this.ready = false;
    this.imageReady = false;
    this.imageIsLoading = false;

    this.terrainReady = false;
    this.terrainIsLoading = false;
    this.refreshIndexesBuffer = false;

    this.node;
};

og.planetSegment.PlanetSegment.prototype.loadTileImage = function () {
    if (!this.imageIsLoading) {
        this.imageReady = false;
        this.imageIsLoading = true;
        this.planet.baseLayer.handleSegmentTile(this);
    }
};

og.planetSegment.PlanetSegment.prototype.applyTexture = function (img) {
    if (this.ready && this.imageIsLoading) {
        this.node.appliedTextureNodeId = this.node.nodeId;
        this.imageReady = true;
        this.texture = this._ctx.createTextureFromImage(img);
        this.texBias = [0, 0, 1];
    } else {
        this.imageReady = false;
        this.texture = null;
    }
    this.imageIsLoading = false;
};

og.planetSegment.PlanetSegment.prototype.textureNotExists = function () {
    this.imageIsLoading = true;
};

og.planetSegment.PlanetSegment.prototype.terrainNotExists = function () {
    this.terrainReady = false;
    if (this.ready && this.terrainIsLoading) {
        this.terrainIsLoading = false;
        this.terrainReady = true;
        this.node.appliedTerrainNodeId = this.node.nodeId;
        this.gridSize = this.planet.terrainProvider.gridSizeByZoom[this.zoomIndex];
        this.createBoundsByExtent();
        this.deleteBuffers();

        if (this.zoomIndex > 5) {
            this.createCoordsBuffers(og.planetSegment.PlanetSegment.getCornersVertices(this.terrainVertices, this.gridSize), 1);
            this.createIndexesBuffer(1, 1, 1, 1, 1);
            this.gridSize = 1;
            this.refreshIndexesBuffer = false;
        } else {
            this.createCoordsBuffers(this.terrainVertices, this.gridSize);
            this.refreshIndexesBuffer = true;
        }
    }
};

og.planetSegment.PlanetSegment.getCornersVertices = function (vertiesArray, gridSize) {
    var grx3 = 3 * gridSize;
    var ind2 = grx3 * (gridSize + 1) ;
    return [vertiesArray[0], vertiesArray[1], vertiesArray[2],
                vertiesArray[grx3], vertiesArray[grx3 + 1], vertiesArray[grx3 + 2],
                vertiesArray[ind2], vertiesArray[ind2 + 1], vertiesArray[ind2 + 2],
                vertiesArray[ind2 + grx3], vertiesArray[ind2 + grx3 + 1], vertiesArray[ind2 + grx3 + 2]];
};


og.planetSegment.PlanetSegment.prototype.loadTerrain = function () {
    if (this.zoomIndex >= this.planet.terrainProvider.minZoom) {
        if (this.zoomIndex <= this.planet.terrainProvider.maxZoom) {
            if (!this.terrainIsLoading && !this.terrainReady) {
                this.terrainReady = false;
                this.terrainIsLoading = true;
                this.planet.terrainProvider.handleSegmentTerrain(this);
            }
        }
    } else {
        this.terrainReady = true;
    }
};

og.planetSegment.PlanetSegment.prototype.applyTerrain = function (elevations)
{
    if (this.ready && this.terrainIsLoading)
    {
        var xmin = og.math.MAX, xmax = og.math.MIN, ymin = og.math.MAX, ymax = og.math.MIN, zmin = og.math.MAX, zmax = og.math.MIN;
        this.gridSize = this.planet.terrainProvider.gridSizeByZoom[this.zoomIndex];
        var fileGridSize = this.planet.terrainProvider.fileGridSize;
        var step = (fileGridSize - 1) / this.gridSize;

        for (var i = 0, iv = 0; i < fileGridSize; i += step, iv++)
        {
            for (var j = 0, jv = 0; j < fileGridSize; j += step, jv++)
            {
                var vInd = (iv * (this.gridSize + 1) + jv) * 3;
                var v0 = new og.math.Vector3(this.plainVertices[vInd], this.plainVertices[vInd + 1], this.plainVertices[vInd + 2]);
                var v0_len = v0.length();
                v0.scale((v0_len + this.planet.heightFactor * elevations[i * fileGridSize + j] * 0.001) / v0_len);

                this.terrainVertices[vInd] = v0.x;
                this.terrainVertices[vInd + 1] = v0.y;
                this.terrainVertices[vInd + 2] = v0.z;

                if (v0.x < xmin) xmin = v0.x; if (v0.x > xmax) xmax = v0.x;
                if (v0.y < ymin) ymin = v0.y; if (v0.y > ymax) ymax = v0.y;
                if (v0.z < zmin) zmin = v0.z; if (v0.z > zmax) zmax = v0.z;
            }
        }

        this.setBoundVolumes(xmin, xmax, ymin, ymax, zmin, zmax);

        this.deleteBuffers();
        this.createCoordsBuffers(this.terrainVertices, this.gridSize);
        this.refreshIndexesBuffer = true;

        elevations.length = 0;

        this.terrainReady = true;
        this.terrainIsLoading = false;

        this.node.appliedTerrainNodeId = this.node.nodeId;
    }
};

og.planetSegment.PlanetSegment.prototype.setBoundVolumes = function (xmin, xmax, ymin, ymax, zmin, zmax) {
    this.bbox.setVertices(xmin, xmax, ymin, ymax, zmin, zmax);
    this.bsphere.center = new og.math.Vector3(xmin + (xmax - xmin) / 2, ymin + (ymax - ymin) / 2, zmin + (zmax - zmin) / 2);
    this.bsphere.radius = this.bsphere.center.distance(this.bbox.vertices[0]);
};


og.planetSegment.PlanetSegment.prototype.deleteBuffers = function () {
    this._ctx.gl.deleteBuffer(this.vertexPositionBuffer);
    this._ctx.gl.deleteBuffer(this.vertexIndexBuffer);
    this._ctx.gl.deleteBuffer(this.vertexTextureCoordBuffer);
};

og.planetSegment.PlanetSegment.prototype.deleteTexture = function () {
    if (this.imageReady) {
        this.imageReady = false;
        this._ctx.gl.deleteTexture(this.texture);
        this.texture = null;
        this.texBias.length = 0;
    }
    this.imageIsLoading = false;
};

og.planetSegment.PlanetSegment.prototype.clearBuffers = function () {
    this.ready = false;
    this.deleteBuffers();
};

og.planetSegment.PlanetSegment.prototype.deleteElevations = function () {
    this.terrainReady = false;
    this.terrainIsLoading = false;
    this.terrainVertices.length = 0;
    this.plainVertices.length = 0;
};

og.planetSegment.PlanetSegment.prototype.clearSegment = function () {
    this.clearBuffers();
    this.deleteTexture();
    this.deleteElevations();
};


og.planetSegment.PlanetSegment.prototype.destroySegment = function () {
    this.clearSegment();
    this.extent.length = 0;
};

og.planetSegment.PlanetSegment.prototype.createCoordsBuffers = function (vertices, gridSize) {
    var gsgs = (gridSize + 1) * (gridSize + 1);
    this.vertexTextureCoordBuffer = this._ctx.createArrayBuffer(new Float32Array(og.planetSegment.PlanetSegmentHelper.textureCoordsTable[gridSize]), 2, gsgs);
    this.vertexPositionBuffer = this._ctx.createArrayBuffer(new Float32Array(vertices), 3, gsgs);
};

og.planetSegment.PlanetSegment.prototype.createIndexesBuffer = function (northGridSize, westGridSize, southGridSize, eastGridSize, gridSize) {
    var indexes = [];
    og.planetSegment.PlanetSegmentHelper.createSegmentIndexes(indexes, gridSize, northGridSize, westGridSize, southGridSize, eastGridSize);
    this.vertexIndexBuffer = this._ctx.createElementArrayBuffer(new Uint16Array(indexes), 1, indexes.length);
    indexes.length = 0;
};

og.planetSegment.PlanetSegment.prototype.createBounds = function () {
    var pn = this.node,
        scale = 0,
        offsetX = 0,
        offsetY = 0;

    while (pn.parentNode && !pn.planetSegment.terrainReady) {
        if (pn.partId === og.quadTree.NW) {
        } else if (pn.partId === og.quadTree.NE) {
            offsetX += Math.pow(2, scale);
        } else if (pn.partId === og.quadTree.SW) {
            offsetY += Math.pow(2, scale);
        } else if (pn.partId === og.quadTree.SE) {
            offsetX += Math.pow(2, scale);
            offsetY += Math.pow(2, scale);
        }
        scale++;
        pn = pn.parentNode;
    }

    var partGridSize = pn.planetSegment.gridSize / Math.pow(2, scale);
    if (pn.planetSegment.terrainReady && partGridSize > 1) {
        var pVerts = pn.planetSegment.terrainVertices;
        var i0 = partGridSize * offsetY;
        var j0 = partGridSize * offsetX;
        var ind1 = 3 * (i0 * (pn.planetSegment.gridSize + 1) + j0);
        var ind2 = 3 * ((i0 + partGridSize) * (pn.planetSegment.gridSize + 1) + j0 + partGridSize);

        this.setBoundVolumes(pVerts[ind1], pVerts[ind2], pVerts[ind1 + 1], pVerts[ind2 + 1], pVerts[ind1 + 2], pVerts[ind2 + 2]);
    } else {
        this.createBoundsByExtent();
    }
};

og.planetSegment.PlanetSegment.prototype.assignTileIndexes = function (zoomIndex, extent) {
    this.zoomIndex = zoomIndex;
    this.extent = extent;
    var gr = og.planetSegment.inverseMercator(extent[og.extent.LEFT] + (extent[og.extent.RIGHT] - extent[og.extent.LEFT]) / 2, extent[og.extent.BOTTOM] + (extent[og.extent.TOP] - extent[og.extent.BOTTOM]) / 2);
    var tile = og.layer.lonlat2tile(gr[og.planetSegment.LON], gr[og.planetSegment.LAT], zoomIndex);
    this.tileX = tile[og.math.X];
    this.tileY = tile[og.math.Y];
};

og.planetSegment.PlanetSegment.prototype.createBoundsByExtent = function () {
    var xmin = og.math.MAX, xmax = og.math.MIN, ymin = og.math.MAX, ymax = og.math.MIN, zmin = og.math.MAX, zmax = og.math.MIN;
    var v = [];

    v.push(
        og.planetSegment.inverseMercator(this.extent[og.extent.LEFT], this.extent[og.extent.BOTTOM]),
        og.planetSegment.inverseMercator(this.extent[og.extent.LEFT], this.extent[og.extent.TOP]),
        og.planetSegment.inverseMercator(this.extent[og.extent.RIGHT], this.extent[og.extent.TOP]),
        og.planetSegment.inverseMercator(this.extent[og.extent.RIGHT], this.extent[og.extent.BOTTOM]));

    v.push([v[0][og.planetSegment.LON] + (v[2][og.planetSegment.LON] - v[0][og.planetSegment.LON]) / 2, v[0][og.planetSegment.LAT] + (v[2][og.planetSegment.LAT] - v[0][og.planetSegment.LAT]) / 2]);

    for (var i = 0; i < 5; i++) {
        var coord = this.planet.ellipsoid.LatLon2ECEF(v[i][og.planetSegment.LAT], v[i][og.planetSegment.LON], 0);
        var x = coord[og.math.Y], y = coord[og.math.Z], z = coord[og.math.X];
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
        if (z < zmin) zmin = z;
        if (z > zmax) zmax = z;
    }

    this.setBoundVolumes(xmin, xmax, ymin, ymax, zmin, zmax);
};

og.planetSegment.PlanetSegment.prototype.createPlainVertices = function (gridSize) {
    this.plainVertices.length = 0;
    var lonSize = this.extent[og.extent.RIGHT] - this.extent[og.extent.LEFT];
    var llStep = lonSize / gridSize;
    for (var i = 0; i <= gridSize; i++) {
        for (var j = 0; j <= gridSize; j++) {
            var gr = og.planetSegment.inverseMercator(this.extent[og.extent.LEFT] + j * llStep, this.extent[og.extent.TOP] - i * llStep);
            var v = this.planet.ellipsoid.LatLon2ECEF(gr[og.planetSegment.LAT], gr[og.planetSegment.LON], 0);
            this.plainVertices.push(v[og.math.Y], v[og.math.Z], v[og.math.X]);
        }
    }
};

og.planetSegment.PlanetSegment.prototype.draw = function () {
    if (this.ready) {
        this._ctx.bindTexture(this.texture);
        this._ctx.setTextureBias(this.texBias);
        this._ctx.drawBuffer(this.vertexPositionBuffer, this.vertexTextureCoordBuffer, this.vertexIndexBuffer);
    }
};