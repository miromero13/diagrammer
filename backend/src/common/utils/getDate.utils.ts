export interface GetDateResponse {
    date: string;
    time: string;
}

export const getDate = (): GetDateResponse => {
    const date = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
}