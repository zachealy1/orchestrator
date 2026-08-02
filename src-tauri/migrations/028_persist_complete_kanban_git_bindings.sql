
                ALTER TABLE kanban_card_repository_selections
                    ADD COLUMN include_dirty INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE kanban_repository_bindings
                    ADD COLUMN binding_json TEXT NOT NULL DEFAULT '{}';

                UPDATE kanban_repository_bindings
                SET binding_json = json_object(
                    'sourceRepositoryPath', repository_path,
                    'relativePath', relative_path,
                    'executionRoot', CASE
                        WHEN length(worktree_path) > length(relative_path) + 1
                         AND substr(
                               worktree_path,
                               length(worktree_path) - length(relative_path) + 1
                             ) = relative_path
                        THEN substr(
                               worktree_path,
                               1,
                               length(worktree_path) - length(relative_path) - 1
                             )
                        ELSE worktree_path
                    END,
                    'sourceBranch', base_branch,
                    'baseBranch', base_branch,
                    'baseCommit', base_commit,
                    'cardBranch', card_branch,
                    'worktreePath', worktree_path,
                    'status', CASE
                        WHEN length(worktree_path) <= length(relative_path) + 1
                          OR substr(
                               worktree_path,
                               length(worktree_path) - length(relative_path) + 1
                             ) != relative_path
                            THEN 'cleanupRequired'
                        WHEN state = 'conflicted' THEN 'conflicted'
                        WHEN state = 'missing' THEN 'missing'
                        WHEN state = 'cleanup_pending' THEN 'cleanupRequired'
                        WHEN state = 'cleanup_failed' THEN 'cleanupFailed'
                        WHEN state = 'removed' THEN 'removed'
                        WHEN state = 'provisioning' THEN 'provisioning'
                        ELSE 'ready'
                    END,
                    'error', CASE
                        WHEN length(worktree_path) <= length(relative_path) + 1
                          OR substr(
                               worktree_path,
                               length(worktree_path) - length(relative_path) + 1
                             ) != relative_path
                        THEN json_object(
                            'repositoryPath', repository_path,
                            'code', 'legacy_binding_path',
                            'message', 'The persisted worktree path could not be migrated safely.',
                            'cleanupRequired', json('true')
                        )
                        WHEN last_error IS NOT NULL THEN json_object(
                            'repositoryPath', repository_path,
                            'code', 'legacy_binding_error',
                            'message', last_error,
                            'cleanupRequired', json('true')
                        )
                        ELSE NULL
                    END
                )
                WHERE binding_json = '{}';
            
