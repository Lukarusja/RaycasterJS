    function playRaycaster(passedCanvas) {

        var CIRCLE = Math.PI * 2;

        //This function defines controls, currently they are set to WSAD
        function Controls() {
            this.codes = {
                87: 'forward',
                83: 'backward',
                65: 'left',
                68: 'right',
            };
            this.states = {
                'left': false,
                'right': false,
                'forward': false,
                'backward': false
            };
            document.addEventListener('keydown', this.onKey.bind(this, true), false);
            document.addEventListener('keyup', this.onKey.bind(this, false), false);
        }

        Controls.prototype.onKey = function(val, e) {
            var state = this.codes[e.keyCode];
            if (typeof state === 'undefined') return;
            this.states[state] = val;
            e.preventDefault && e.preventDefault();
            e.stopPropagation && e.stopPropagation();
        };

        function Bitmap(src, width, height) {
            this.image = new Image();
            this.image.src = src;
            this.width = width;
            this.height = height;
        }

        //creates a player, from which every ray will be cast
        function Player(x, y, direction) {
            this.x = x;
            this.y = y;
            this.direction = direction;

            this.paces = 0;
        }

        Player.prototype.rotate = function(angle) {
            this.direction = (this.direction + angle + CIRCLE) % (CIRCLE);
        };

        Player.prototype.walk = function(distance, map) {
            var dx = Math.cos(this.direction) * distance;
            var dy = Math.sin(this.direction) * distance;
            if (map.get(this.x + dx, this.y) <= 0) this.x += dx;
            if (map.get(this.x, this.y + dy) <= 0) this.y += dy;
            this.paces += distance;
        };

        Player.prototype.update = function(controls, map, seconds) {
            if (controls.left) this.rotate(-Math.PI * seconds);
            if (controls.right) this.rotate(Math.PI * seconds);
            if (controls.forward) this.walk(3 * seconds, map);
            if (controls.backward) this.walk(-3 * seconds, map);
        };

        function Map(size) {
            this.size = size;
            this.wallGrid = new Uint8Array(size * size);
            this.skybox = new Bitmap('../../assets/ceiling.jpg', 2000, 750);
            this.wallTexture = new Bitmap('../../assets/wall_texture.jpg', 1024, 1024);
            this.light = 5;
        }

        Map.prototype.get = function(x, y) {
            x = Math.floor(x);
            y = Math.floor(y);
            if (x < 0 || x > this.size - 1 || y < 0 || y > this.size - 1) return -1;
            return this.wallGrid[y * this.size + x];
        };

        Map.prototype.randomize = function() {
            for (var i = 0; i < this.size * this.size; i++) {
                this.wallGrid[i] = Math.random() < 0.3 ? 1 : 0;
            }
        };

        Map.prototype.cast = function(point, angle, range) {
            var self = this;
            var sin = Math.sin(angle);
            var cos = Math.cos(angle);
            var noWall = {
                length2: Infinity
            };

            return ray({
                x: point.x,
                y: point.y,
                height: 0,
                distance: 0
            });


            //find the nearest horizontal (stepX) and vertical (stepY) gridlines
            function ray(origin) {
                var stepX = step(sin, cos, origin.x, origin.y);
                var stepY = step(cos, sin, origin.y, origin.x, true);
                var nextStep = stepX.length2 < stepY.length2 ?
                    inspect(stepX, 1, 0, origin.distance, stepX.y) :
                    inspect(stepY, 0, 1, origin.distance, stepY.x);

                if (nextStep.distance > range) return [origin];
                return [origin].concat(ray(nextStep));
            }

            //these steps are perform until the entire ray is checked for gridlines
            function step(rise, run, x, y, inverted) {
                if (run === 0) return noWall;
                var dx = run > 0 ? Math.floor(x + 1) - x : Math.ceil(x - 1) - x;
                var dy = dx * (rise / run);
                return {
                    x: inverted ? y + dy : x + dx,
                    y: inverted ? x + dx : y + dy,
                    length2: dx * dx + dy * dy
                };
            }

            // this function checks if the tile contains a wall or not
            function inspect(step, shiftX, shiftY, distance, offset) {
                var dx = cos < 0 ? shiftX : 0;
                var dy = sin < 0 ? shiftY : 0;
                step.height = self.get(step.x - dx, step.y - dy);
                step.distance = distance + Math.sqrt(step.length2);
                if (shiftX) step.shading = cos < 0 ? 2 : 0;
                else step.shading = sin < 0 ? 2 : 1;
                step.offset = offset - Math.floor(offset);
                return step;
            }
        };

        Map.prototype.update = function(seconds) {
            if (this.light > 0) this.light = Math.max(this.light - 10 * seconds, 0);
        };

        function Camera(canvas, resolution, focalLength) {
            this.ctx = canvas.getContext('2d');
            this.width = canvas.width = window.innerWidth * 0.5;
            this.height = canvas.height = window.innerHeight * 0.5;
            this.resolution = resolution;
            this.spacing = this.width / resolution;
            this.focalLength = focalLength || 0.8;
            this.range = 14;
            this.lightRange = 5;
            this.scale = (this.width + this.height) / 1200;
        }

        Camera.prototype.render = function(player, map) {
            this.drawSky(player.direction, map.skybox, map.light);
            this.drawColumns(player, map);
        };

        Camera.prototype.drawSky = function(direction, sky, ambient) {
            var width = sky.width * (this.height / sky.height) * 2;
            var left = (direction / CIRCLE) * -width;

            this.ctx.save();
            this.ctx.drawImage(sky.image, left, 0, width, this.height);
            if (left < width - this.width) {
                this.ctx.drawImage(sky.image, left + width, 0, width, this.height);
            }
            if (ambient > 0) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.globalAlpha = ambient * 0.1;
                this.ctx.fillRect(0, this.height * 0.5, this.width, this.height * 0.5);
            }
            this.ctx.restore();
        };

        Camera.prototype.drawColumns = function(player, map) {
            this.ctx.save();
            for (var column = 0; column < this.resolution; column++) {
                var x = column / this.resolution - 0.5;
                var angle = Math.atan2(x, this.focalLength);
                var ray = map.cast(player, player.direction + angle, this.range);
                this.drawColumn(column, ray, angle, map);
            }
            this.ctx.restore();
        };



        Camera.prototype.drawColumn = function(column, ray, angle, map) {
            var ctx = this.ctx;
            var texture = map.wallTexture;
            var left = Math.floor(column * this.spacing);
            var width = Math.ceil(this.spacing);
            var hit = -1;

            while (++hit < ray.length && ray[hit].height <= 0);

            for (var s = ray.length - 1; s >= 0; s--) {
                var step = ray[s];


                if (s === hit) {
                    var textureX = Math.floor(texture.width * step.offset);
                    var wall = this.project(step.height, angle, step.distance);

                    ctx.globalAlpha = 1;
                    ctx.drawImage(texture.image, textureX, 0, 1, texture.height, left, wall.top, width, wall.height);

                    ctx.fillStyle = '#000000';
                    ctx.globalAlpha = Math.max(step.distance / this.lightRange, 0);
                    ctx.fillRect(left, wall.top, width, wall.height);
                }

                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.15;

            }
        };

        Camera.prototype.project = function(height, angle, distance) {
            var z = distance * Math.cos(angle);
            var wallHeight = this.height * height / z;
            var bottom = this.height / 2 * (1 + 1 / z);
            return {
                top: bottom - wallHeight,
                height: wallHeight
            };
        };

        function GameLoop() {
            this.frame = this.frame.bind(this);
            this.lastTime = 0;
            this.callback = function() {};
        }

        GameLoop.prototype.start = function(callback) {
            this.callback = callback;
            requestAnimationFrame(this.frame);
        };

        GameLoop.prototype.frame = function(time) {
            var seconds = (time - this.lastTime) / 1000;
            this.lastTime = time;
            if (seconds < 0.2) this.callback(seconds);
            requestAnimationFrame(this.frame);
        };

        var display = passedCanvas;
        var player = new Player(5.5, -1.5, Math.PI * 0.3);
        var map = new Map(10);
        var controls = new Controls();
        var camera = new Camera(display, 320, 0.8);
        var loop = new GameLoop();

        map.randomize();

        loop.start(function frame(seconds) {
            map.update(seconds);
            player.update(controls.states, map, seconds);
            camera.render(player, map);
        });


    }