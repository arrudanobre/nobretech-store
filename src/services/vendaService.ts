import { supabase } from "@/lib/supabase"

// Função para registrar a venda no banco de dados
export const registrarVenda = async (dadosVenda: any) => {
    console.log("Registrando venda com dados:", dadosVenda);
    const { data, error } = await (supabase
        .from("sales") as any)
        .insert([dadosVenda]);

    if (error) {
        console.error("Erro ao registrar a venda:", error);
        throw new Error(error.message);
    }
    
    console.log("Venda registrada com sucesso:", data);
    return data;
};

// Função para atualizar o status do aparelho no estoque
export const atualizarStatusEstoque = async (aparelhoId: string, status: string) => {
    const { error } = await (supabase
        .from("inventory") as any)
        .update({ status })
        .eq("id", aparelhoId);
    
    if (error) throw error;
};