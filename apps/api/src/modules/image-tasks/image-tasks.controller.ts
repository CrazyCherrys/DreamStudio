import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ImageTasksService } from './image-tasks.service';
import type { CreateImageTaskBody, ImageTaskListQuery } from './image-tasks.types';

@Controller('image-tasks')
@UseGuards(SessionAuthGuard)
export class ImageTasksController {
  constructor(private readonly imageTasksService: ImageTasksService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  createTask(@Body() body: CreateImageTaskBody, @Req() request: AuthenticatedRequest) {
    return this.imageTasksService.createTask(body, request.auth!);
  }

  @Get()
  listTasks(@Query() query: ImageTaskListQuery, @Req() request: AuthenticatedRequest) {
    return this.imageTasksService.listTasks(query, request.auth!);
  }

  @Get(':taskId')
  getTask(@Param('taskId') taskId: string, @Req() request: AuthenticatedRequest) {
    return this.imageTasksService.getTask(taskId, request.auth!);
  }

  @Post(':taskId/cancel')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  cancelTask(@Param('taskId') taskId: string, @Req() request: AuthenticatedRequest) {
    return this.imageTasksService.cancelTask(taskId, request.auth!);
  }

  @Post(':taskId/retry')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  retryTask(@Param('taskId') taskId: string, @Req() request: AuthenticatedRequest) {
    return this.imageTasksService.retryTask(taskId, request.auth!);
  }

  @Delete(':taskId')
  @UseGuards(CsrfGuard)
  deleteTask(@Param('taskId') taskId: string, @Req() request: AuthenticatedRequest) {
    return this.imageTasksService.deleteTask(taskId, request.auth!);
  }
}
