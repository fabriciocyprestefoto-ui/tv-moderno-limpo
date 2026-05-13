cmake_minimum_required(VERSION 3.18.1)

project("redxsecurity")

# ═══════════════════════════════════════════════════════════════════════════
# SECURITY COMPILER FLAGS
# ═══════════════════════════════════════════════════════════════════════════

# Stack protection e FORTIFY_SOURCE para prevenir buffer overflows
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIC")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIC -fno-rtti -fno-exceptions")

# Release: strip símbolos e otimização máxima (dificulta engenharia reversa)
set(CMAKE_C_FLAGS_RELEASE "${CMAKE_C_FLAGS_RELEASE} -s -O3 -DNDEBUG -fvisibility=hidden")
set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -s -O3 -DNDEBUG -fvisibility=hidden")

# Linker flags para segurança
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,-z,relro -Wl,-z,now")

# ═══════════════════════════════════════════════════════════════════════════
# LIBRARY CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

add_library(
    redxsecurity
    SHARED
    native-lib.cpp
)

# Bibliotecas do sistema Android
find_library(log-lib log)

target_link_libraries(
    redxsecurity
    ${log-lib}
)
