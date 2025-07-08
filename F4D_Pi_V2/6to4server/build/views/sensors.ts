class Sensor {
    constructor(public ipv6 : string, public name?: string) { 
        this.ipv6 = ipv6;
        this.name = name;
    }

    addName(name:string){
        this.name = name;
    }
}

class SensorsList {
    public sensors: Sensor [] = [];

    addSensor(sp: Sensor){
        this.sensors.push(sp);
    }
}