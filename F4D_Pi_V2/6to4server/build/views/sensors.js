"use strict";
class Sensor {
    constructor(ipv6, name) {
        this.ipv6 = ipv6;
        this.name = name;
        this.ipv6 = ipv6;
        this.name = name;
    }
    addName(name) {
        this.name = name;
    }
}
class SensorsList {
    constructor() {
        this.sensors = [];
    }
    addSensor(sp) {
        this.sensors.push(sp);
    }
}
