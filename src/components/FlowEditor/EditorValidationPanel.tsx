import type { GraphValidationResult } from '../api/graphEditMaps';

interface EditorValidationPanelProps {
    validation: GraphValidationResult;
    onNodeClick?: (nodeId: number, groupId: string | null) => void;
}

export default function EditorValidationPanel({
    validation,
    onNodeClick,
}: EditorValidationPanelProps) {
    const { valid, errors, warnings, globalIssues, groups } = validation;
    const errorCount = errors.length;
    const warningCount = warnings.length;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div
                className={`px-4 py-3 border-b border-base-content/5 ${
                    valid
                        ? warningCount > 0
                            ? 'bg-warning/10'
                            : 'bg-success/10'
                        : 'bg-error/10'
                }`}
            >
                <p
                    className={`text-sm font-medium ${
                        valid
                            ? warningCount > 0
                                ? 'text-warning'
                                : 'text-success'
                            : 'text-error'
                    }`}
                >
                    {valid
                        ? warningCount > 0
                            ? `Граф валідний · ${warningCount} застережень`
                            : 'Граф валідний ✓'
                        : `Граф невалідний · ${errorCount} помилок`}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {globalIssues.length > 0 && (
                    <section>
                        <h3 className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold mb-2">
                            Загальні проблеми
                        </h3>
                        <ul className="space-y-1">
                            {globalIssues.map((issue) => (
                                <li key={issue} className="text-xs text-error">
                                    • {issue}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {groups.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold">
                            Помилки по групах
                        </h3>
                        {groups.map((group) => (
                            <div
                                key={group.groupId ?? '__none__'}
                                className="rounded-lg border border-base-content/10 bg-base-200/30 overflow-hidden"
                            >
                                <div className="px-3 py-2 bg-base-200/50 border-b border-base-content/5">
                                    <p className="text-xs font-semibold truncate" title={group.groupTitle}>
                                        {group.groupTitle}
                                    </p>
                                    <p className="text-[10px] opacity-50">
                                        {group.nodes.length}{' '}
                                        {group.nodes.length === 1 ? 'вузол' : 'вузлів'}
                                    </p>
                                </div>
                                <ul className="divide-y divide-base-content/5">
                                    {group.nodes.map((node) => (
                                        <li key={node.nodeId} className="px-3 py-2">
                                            {onNodeClick ? (
                                                <button
                                                    type="button"
                                                    className="text-xs font-medium text-left hover:text-primary transition-colors"
                                                    onClick={() =>
                                                        onNodeClick(node.nodeId, group.groupId)
                                                    }
                                                >
                                                    «{node.nodeTitle}»
                                                </button>
                                            ) : (
                                                <p className="text-xs font-medium">
                                                    «{node.nodeTitle}»
                                                </p>
                                            )}
                                            <ul className="mt-1 space-y-0.5">
                                                {node.problems.map((problem) => (
                                                    <li
                                                        key={problem}
                                                        className="text-[11px] text-error/90 pl-2 border-l-2 border-error/30"
                                                    >
                                                        {problem}
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </section>
                )}

                {valid && warningCount > 0 && (
                    <section>
                        <h3 className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold mb-2">
                            Застереження
                        </h3>
                        <ul className="space-y-1">
                            {warnings.map((warn) => (
                                <li key={warn} className="text-xs text-warning">
                                    ⚠ {warn}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {!valid && groups.length === 0 && globalIssues.length === 0 && (
                    <ul className="space-y-1">
                        {errors.map((err) => (
                            <li key={err} className="text-xs text-error">
                                • {err}
                            </li>
                        ))}
                    </ul>
                )}

                {valid && warningCount === 0 && groups.length === 0 && globalIssues.length === 0 && (
                    <p className="text-xs opacity-50 text-center py-4">
                        Проблем не виявлено
                    </p>
                )}
            </div>
        </div>
    );
}
