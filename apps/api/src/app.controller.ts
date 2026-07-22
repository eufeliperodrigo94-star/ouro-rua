import { Controller, Get } from "@nestjs/common";
@Controller()
export class AppController {
  @Get("health")
  health() { return { status: "ok", app: "Ouro Rua API", ts: new Date().toISOString() }; }
}
