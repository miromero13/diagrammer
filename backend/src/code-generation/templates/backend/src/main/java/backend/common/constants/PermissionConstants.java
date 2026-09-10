package backend.common.constants;

import java.util.Arrays;

public final class PermissionConstants {
    private PermissionConstants() {}

    public static final String CREAR_USUARIO = "crear_usuario";
    public static final String EDITAR_USUARIO = "editar_usuario";
    public static final String ELIMINAR_USUARIO = "eliminar_usuario";
    public static final String LISTAR_USUARIO = "listar_usuario";
    public static final String CREAR_ROL = "crear_rol";
    public static final String EDITAR_ROL = "editar_rol";
    public static final String ELIMINAR_ROL = "eliminar_rol";
    public static final String LISTAR_ROL = "listar_rol";
    public static final String CREAR_PERMISO = "crear_permiso";
    public static final String EDITAR_PERMISO = "editar_permiso";
    public static final String ELIMINAR_PERMISO = "eliminar_permiso";
    public static final String LISTAR_PERMISO = "listar_permiso";

    public record PermissionDefinition(String name, String description) {}

    public static final PermissionDefinition[] PERMISSIONS = {
            new PermissionDefinition(CREAR_USUARIO, "Crear usuarios"),
            new PermissionDefinition(EDITAR_USUARIO, "Editar usuarios"),
            new PermissionDefinition(ELIMINAR_USUARIO, "Eliminar usuarios"),
            new PermissionDefinition(LISTAR_USUARIO, "Listar usuarios"),
            new PermissionDefinition(CREAR_ROL, "Crear roles"),
            new PermissionDefinition(EDITAR_ROL, "Editar roles"),
            new PermissionDefinition(ELIMINAR_ROL, "Eliminar roles"),
            new PermissionDefinition(LISTAR_ROL, "Listar roles"),
            new PermissionDefinition(CREAR_PERMISO, "Crear permisos"),
            new PermissionDefinition(EDITAR_PERMISO, "Editar permisos"),
            new PermissionDefinition(ELIMINAR_PERMISO, "Eliminar permisos"),
            new PermissionDefinition(LISTAR_PERMISO, "Listar permisos")
    };

    public static final String[] SUPERADMIN_PERMISSION_NAMES = Arrays.stream(PERMISSIONS)
            .map(PermissionDefinition::name).toArray(String[]::new);
    public static final String[] ADMIN_PERMISSION_NAMES = {
            CREAR_USUARIO, EDITAR_USUARIO, ELIMINAR_USUARIO, LISTAR_USUARIO,
            CREAR_ROL, EDITAR_ROL, ELIMINAR_ROL, LISTAR_ROL
    };
    public static final String[] EMPLOYEE_PERMISSION_NAMES = {};
}
