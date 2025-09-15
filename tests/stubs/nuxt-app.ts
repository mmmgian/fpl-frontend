import { ref, type Ref } from 'vue'

type AsyncData<T> = {
  data: Ref<T | null>
  error: Ref<unknown>
}

export async function useFetch<T>(): Promise<AsyncData<T>> {
  return {
    data: ref(null) as Ref<T | null>,
    error: ref(null) as Ref<unknown>,
  }
}
