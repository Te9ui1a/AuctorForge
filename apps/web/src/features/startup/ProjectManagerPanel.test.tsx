import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectManagerPanel } from './ProjectManagerPanel';
import { ProjectInfo } from './projectTypes';

afterEach(() => {
  cleanup();
});

const projects: ProjectInfo[] = [
  {
    id: 'proj-1',
    name: '星港回声',
    rootPath: '/tmp/star-harbor',
    lastModified: Date.now(),
    status: 'active',
    phase: '正文推进',
    coreTask: '完善第二章冲突',
  },
  {
    id: 'proj-2',
    name: '归档样本',
    rootPath: '/tmp/archive-sample',
    lastModified: Date.now() - 1000,
    status: 'archived',
    phase: '已归档',
    coreTask: '留作参考',
  },
];

function expectLucideStartupIcon(button: HTMLElement, iconName: string) {
  expect(button.querySelector(`[data-startup-icon="${iconName}"][data-icon-system="lucide"]`)).toBeTruthy();
}

describe('ProjectManagerPanel', () => {
  it('shows management actions whenever the resolved variant is management', () => {
    render(
      <ProjectManagerPanel
        projects={projects}
        onSelectProject={vi.fn()}
        selectedProjectId="proj-1"
        managementMode={false}
        variant="management"
        onRepairProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onRemoveProject={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '项目管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修复项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '归档项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从列表移除' })).toBeInTheDocument();
  });

  it('renders recent projects with direct continue actions and no management actions', () => {
    render(
      <ProjectManagerPanel
        projects={projects}
        onSelectProject={vi.fn()}
        selectedProjectId="proj-1"
        variant="recent"
        onContinueProject={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '最近项目' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /选择并继续/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '修复项目' })).not.toBeInTheDocument();
  });

  it('uses shared control tiers and Lucide-led icons for management actions', () => {
    render(
      <ProjectManagerPanel
        projects={projects}
        onSelectProject={vi.fn()}
        selectedProjectId="proj-1"
        managementMode
        onRepairProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onRemoveProject={vi.fn()}
      />,
    );

    const repairButton = screen.getByRole('button', { name: '修复项目' });
    const archiveButton = screen.getByRole('button', { name: '归档项目' });
    const removeButton = screen.getByRole('button', { name: '从列表移除' });
    expect([repairButton, archiveButton, removeButton]).toHaveLength(3);

    expect(repairButton).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(archiveButton).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(removeButton).toHaveAttribute('data-ui-control-tier', 'destructive');

    expectLucideStartupIcon(repairButton, 'repair');
    expectLucideStartupIcon(archiveButton, 'archive');
    expectLucideStartupIcon(removeButton, 'remove');
  });

  it('requires confirmation before removing a project from the list', () => {
    const onRemoveProject = vi.fn();

    render(
      <ProjectManagerPanel
        projects={projects}
        onSelectProject={vi.fn()}
        selectedProjectId="proj-1"
        managementMode
        onRepairProject={vi.fn()}
        onToggleArchiveProject={vi.fn()}
        onRemoveProject={onRemoveProject}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '从列表移除' }));

    expect(onRemoveProject).not.toHaveBeenCalled();
    expect(screen.getByText('确认要将“星港回声”从列表移除吗？项目文件不会被删除。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '取消移除' }));
    expect(screen.queryByText('确认要将“星港回声”从列表移除吗？项目文件不会被删除。')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '从列表移除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认移除' }));

    expect(onRemoveProject).toHaveBeenCalledWith(projects[0]);
  });
});
