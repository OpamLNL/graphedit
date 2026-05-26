/** false з API/БД (boolean або MySQL TINYINT 0). */
export function isMapGraphNotValidated(
    graphValidated: boolean | null | undefined | number,
): boolean {
    return graphValidated === false || graphValidated === 0;
}
