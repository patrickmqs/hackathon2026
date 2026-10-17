import { Router } from "express";
import multer from "multer";
import type { AppDeps } from "../core/deps.js";
import { DomainError } from "../core/errors.js";
import { parseBody, parsePagination } from "../core/http.js";
import { toEventDto, toMeetingDto, toProjectDto } from "../core/serializers.js";
import { EVENT_TYPES } from "../domain/events.js";
import {
  PLACEHOLDER_COMPANY,
  PLACEHOLDER_PROJECT_NAME,
  ProjectCreateSchema,
  ProjectUpdateSchema,
} from "../schemas/project.js";
import { ALLOWED_AUDIO_MIME, MeetingCreateTextSchema } from "../schemas/meeting.js";
import {
  createMeetingFromAudio,
  createMeetingFromText,
} from "../services/meeting/create-meeting.js";

// Rotas de Projetos — API_SPEC §4.2, incluindo criação de reunião (§4.3) que
// aninha sob /projects/{id}/meetings.
export function projectsRouter(deps: AppDeps): Router {
  const { repo, storage, jobs, maxUploadMb = 25 } = deps;
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 },
  });

  router.post("/", async (req, res) => {
    const input = parseBody(ProjectCreateSchema, req.body);
    const project = await repo.createProject({
      name: input.name ?? PLACEHOLDER_PROJECT_NAME,
      description: input.description ?? null,
      client: { ...input.client, company: input.client?.company ?? PLACEHOLDER_COMPANY },
    });
    await repo.createEvent({
      projectId: project.id,
      type: EVENT_TYPES.PROJECT_CREATED,
      actor: null,
      payload: { project_id: project.id },
    });
    res.status(201).json(toProjectDto(project, [], []));
  });

  router.get("/", async (req, res) => {
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const page = await repo.listProjects(limit, offset);
    const items = await Promise.all(
      page.items.map(async (p) => {
        const [meetings, proposals] = await Promise.all([
          repo.listMeetings(p.id),
          repo.listProposals(p.id),
        ]);
        return toProjectDto(p, meetings, proposals);
      }),
    );
    res.json({ items, total: page.total });
  });

  router.get("/:projectId", async (req, res) => {
    const project = await repo.getProject(req.params.projectId);
    if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
    const [meetings, proposals] = await Promise.all([
      repo.listMeetings(project.id),
      repo.listProposals(project.id),
    ]);
    res.json(toProjectDto(project, meetings, proposals));
  });

  // Preenchimento posterior: o usuário completa nome, empresa e contato quando a IA não os achou.
  router.patch("/:projectId", async (req, res) => {
    const project = await repo.getProject(req.params.projectId as string);
    if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
    const input = parseBody(ProjectUpdateSchema, req.body);
    const updated = await repo.updateProject(project.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.client ? { client: { ...project.client, ...input.client } } : {}),
    });
    const [meetings, proposals] = await Promise.all([
      repo.listMeetings(project.id),
      repo.listProposals(project.id),
    ]);
    res.json(toProjectDto(updated ?? project, meetings, proposals));
  });

  router.delete("/:projectId", async (req, res) => {
    const removed = await repo.deleteProject(req.params.projectId as string);
    if (!removed) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
    res.status(204).end();
  });

  router.get("/:projectId/events", async (req, res) => {
    const project = await repo.getProject(req.params.projectId as string);
    if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const page = await repo.listEvents(project.id, limit, offset);
    res.json({ items: page.items.map(toEventDto), total: page.total });
  });

  router.post("/:projectId/meetings", upload.single("audio"), async (req, res) => {
    const projectId = req.params.projectId as string;
    // multipart (áudio) tem precedência; senão, JSON com transcrição textual.
    if (req.file) {
      if (!ALLOWED_AUDIO_MIME.has(req.file.mimetype)) {
        throw new DomainError("UPLOAD_INVALID", "Formato de áudio não suportado.");
      }
      const title = (req.body?.title as string | undefined) ?? null;
      const language = (req.body?.language as string | undefined) ?? null;
      const meeting = await createMeetingFromAudio(repo, storage, projectId, req.file, title, language);
      await repo.createEvent({
        projectId,
        type: EVENT_TYPES.MEETING_CREATED,
        actor: null,
        payload: { meeting_id: meeting.id, source_type: "audio" },
      });
      jobs?.enqueue(meeting.id);
      res.status(202).json(toMeetingDto(meeting, null));
      return;
    }
    const input = parseBody(MeetingCreateTextSchema, req.body);
    const meeting = await createMeetingFromText(repo, projectId, input);
    await repo.createEvent({
      projectId,
      type: EVENT_TYPES.MEETING_CREATED,
      actor: null,
      payload: { meeting_id: meeting.id, source_type: "text" },
    });
    jobs?.enqueue(meeting.id);
    res.status(202).json(toMeetingDto(meeting, null));
  });

  return router;
}
