import { FastifyInstance, FastifyReply } from "fastify";
import { AppError } from "../../lib/errors.js";
import { exportTasksQuerySchema, importRowsBodySchema } from "./tasks.schemas.js";
import * as importService from "./taskImport.service.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// A 1,000-row task sheet is well under 1 MB; a tight cap also bounds how much a hostile
// (zip-bomb style) .xlsx can make the parser decompress.
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS_BODY_BYTES = 5 * 1024 * 1024;

function sendXlsx(reply: FastifyReply, buffer: Buffer, fileName: string) {
  return reply
    .header("Content-Type", XLSX_MIME)
    .header("Content-Disposition", `attachment; filename="${fileName}"`)
    .send(buffer);
}

export default async function taskImportRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  const adminOnly = fastify.requireRole("OWNER", "ADMIN");

  fastify.get("/tasks/import/template", { preHandler: adminOnly }, async (request, reply) => {
    const buffer = await importService.buildImportTemplate(request.authUser.organizationId);
    return sendXlsx(reply, buffer, "task-import-template.xlsx");
  });

  fastify.get("/tasks/import/options", { preHandler: adminOnly }, async (request) => {
    return importService.getImportOptions(request.authUser.organizationId);
  });

  fastify.post("/tasks/import/preview", { preHandler: adminOnly }, async (request) => {
    const file = await request.file({ limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } });
    if (!file) throw AppError.badRequest("No file provided");
    if (!file.filename.toLowerCase().endsWith(".xlsx")) {
      throw AppError.badRequest("Upload an .xlsx file (Excel 2007 or later).");
    }
    // toBuffer() rejects with a 413 once the size limit is exceeded.
    const buffer = await file.toBuffer();
    return importService.previewImport(request.authUser.organizationId, buffer);
  });

  fastify.post("/tasks/import/validate", { preHandler: adminOnly, bodyLimit: MAX_ROWS_BODY_BYTES }, async (request) => {
    const { rows } = importRowsBodySchema.parse(request.body);
    return importService.validateImport(request.authUser.organizationId, rows);
  });

  fastify.post("/tasks/import/commit", { preHandler: adminOnly, bodyLimit: MAX_ROWS_BODY_BYTES }, async (request, reply) => {
    const { rows } = importRowsBodySchema.parse(request.body);
    const result = await importService.commitImport(request.authUser.organizationId, request.authUser, rows);
    if (result.created === 0 && result.validation.summary.errorRows > 0) {
      return reply.code(400).send({
        error: "IMPORT_HAS_ERRORS",
        message: "Some rows have errors that must be fixed before importing.",
        validation: result.validation,
      });
    }
    return reply.code(201).send(result);
  });

  fastify.get("/tasks/export", { preHandler: adminOnly }, async (request, reply) => {
    const filters = exportTasksQuerySchema.parse(request.query);
    const buffer = await importService.exportTasks(request.authUser.organizationId, filters);
    const date = new Date().toISOString().slice(0, 10);
    return sendXlsx(reply, buffer, `tasks-${date}.xlsx`);
  });
}
